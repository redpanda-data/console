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

export type LineWord = { text: string; start: number; end: number };

/**
 * Splits a line into whitespace-delimited words, quote-aware: a `"..."` span
 * (even unterminated) counts as one word so a still-being-typed multi-word
 * value never gets split into separate words mid-edit.
 */
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
    let inQuote = false;
    while (i < n) {
      const ch = text[i];
      if (ch === '"') {
        inQuote = !inQuote;
        i += 1;
        continue;
      }
      if (!inQuote && WHITESPACE_PATTERN.test(ch)) {
        break;
      }
      i += 1;
    }
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
};

/**
 * Parses an entire line into the three pieces the rest of the app already
 * expects: a partition id, structured field tokens, and leftover full-text.
 * A token is "committed" the instant a word is syntactically complete —
 * there's no separate commit step, just continuous re-parsing on every edit.
 */
export function parseFilterLine(text: string): ParsedFilterLine {
  const words = tokenizeLine(text);
  let partitionId: number | null = null;
  const fieldTokens: FieldFilterToken[] = [];
  const remainderParts: string[] = [];

  for (const word of words) {
    const parsed = parseFilterInput(word.text);
    if (!parsed) {
      remainderParts.push(word.text);
      continue;
    }
    if (parsed.field === 'partition') {
      partitionId = Number(parsed.value);
      continue;
    }
    fieldTokens.push({ kind: 'field', field: parsed.field, op: parsed.op, value: parsed.value });
  }

  return { partitionId, fieldTokens, remainder: remainderParts.join(' ') };
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
