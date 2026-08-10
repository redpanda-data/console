/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { parseFilterInput, tokenEditText } from './filter-token';
import type { FieldFilterToken } from '../types';

const WHITESPACE_PATTERN = /\s/;
const VALUE_START_PATTERN = /[:=<>]/;

export type LineWord = { text: string; start: number; end: number };

/**
 * A `"` opens quote mode only where a value can actually start — right at `start`, or right after
 * a `:`/`=`/`<`/`>` operator — so a stray/literal quote elsewhere in a word (`key:a"b`) doesn't get
 * misread as opening a multi-word span and swallow the rest of the line.
 */
const opensQuote = (text: string, i: number, start: number): boolean =>
  text[i] === '"' && (i === start || VALUE_START_PATTERN.test(text[i - 1]));

/**
 * Scans forward from `start` (a word's first character) to find where it ends — see `opensQuote`
 * for when a `"` starts a multi-word quoted span. Once inside a quote, `\"`/`\\` escapes are
 * skipped over rather than treated as the closing quote, matching how `parseFilterInput`/
 * `decodeValue` decode an escaped value. An unterminated quote (no closing `"` anywhere later)
 * counts as still-being-typed and swallows the rest of the line into one word.
 */
function findWordEnd(text: string, start: number): number {
  const n = text.length;
  let i = start;
  let inQuote = false;
  while (i < n) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '\\' && i + 1 < n) {
        i += 2;
        continue;
      }
      inQuote = ch !== '"';
      i += 1;
      continue;
    }
    if (opensQuote(text, i, start)) {
      inQuote = true;
      i += 1;
      continue;
    }
    if (WHITESPACE_PATTERN.test(ch)) {
      break;
    }
    i += 1;
  }
  return i;
}

/** Splits a line into whitespace-delimited words — see `findWordEnd` for the quote-handling rules. */
export function tokenizeLine(text: string): LineWord[] {
  const words: LineWord[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    while (i < n && WHITESPACE_PATTERN.test(text[i])) {
      i += 1;
    }
    if (i >= n) {
      break;
    }
    const start = i;
    i = findWordEnd(text, start);
    words.push({ text: text.slice(start, i), start, end: i });
  }
  return words;
}

export type ParsedFilterLine = {
  /** `null` when no `partition:` word is present in the line. */
  partitionId: number | null;
  fieldTokens: FieldFilterToken[];
  /** Words that didn't parse as a field token, rejoined with single spaces. */
  remainder: string;
  /**
   * Character ranges of every word that parsed as a token (partition or
   * field) — the filter bar's highlight overlay paints a pill over each of
   * these. Exposed here rather than left for a caller to re-derive so there
   * is exactly one place that decides "is this word a recognized token."
   */
  tokenRanges: { start: number; end: number }[];
};

/**
 * Parses an entire line into the pieces the rest of the app already expects:
 * a partition id, structured field tokens, leftover full-text, and the
 * character ranges of the recognized words. A token is "committed" the
 * instant a word is syntactically complete — there's no separate commit
 * step, just continuous re-parsing on every edit.
 */
export function parseFilterLine(text: string): ParsedFilterLine {
  const words = tokenizeLine(text);
  let partitionId: number | null = null;
  const fieldTokens: FieldFilterToken[] = [];
  const remainderParts: string[] = [];
  const tokenRanges: { start: number; end: number }[] = [];

  for (const word of words) {
    const parsed = parseFilterInput(word.text);
    if (!parsed) {
      remainderParts.push(word.text);
      continue;
    }
    tokenRanges.push({ start: word.start, end: word.end });
    if (parsed.field === 'partition') {
      partitionId = Number(parsed.value);
      continue;
    }
    fieldTokens.push({ kind: 'field', field: parsed.field, op: parsed.op, value: parsed.value });
  }

  return { partitionId, fieldTokens, remainder: remainderParts.join(' '), tokenRanges };
}

/**
 * The reverse of `parseFilterLine` — rebuilds a line from the three pieces.
 * Used only to resync the displayed text when props change from *outside*
 * the filter bar (initial mount, "Clear all", browser back/forward); never
 * during normal typing, so it never fights the user's own edits.
 */
export function formatFilterLine(partitionId: number, fieldTokens: FieldFilterToken[], remainder: string): string {
  const parts: string[] = [];
  if (partitionId >= 0) {
    parts.push(`partition:${partitionId}`);
  }
  for (const token of fieldTokens) {
    parts.push(tokenEditText(token));
  }
  if (remainder) {
    parts.push(remainder);
  }
  return parts.join(' ');
}

/** The word (if any) touching the caret — drives the autocomplete dropdown and tells suggestion-acceptance which range to replace. */
export function wordRangeAtCaret(text: string, caret: number): LineWord | null {
  for (const word of tokenizeLine(text)) {
    if (caret >= word.start && caret <= word.end) {
      return word;
    }
  }
  return null;
}
