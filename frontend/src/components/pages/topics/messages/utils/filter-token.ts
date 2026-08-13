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

import type { FieldFilterToken, FilterOp, FilterToken } from '../types';

const FIELD_PATTERN = /^(key|value(?:\.[\w.*-]+)?|partition|offset)/;
const INTEGER_VALUE_PATTERN = /^\d+$/;
const NEEDS_QUOTING_PATTERN = /["\s]/;

/** Fields whose value must be a plain non-negative integer, and whose bare `:` means equality
 * rather than substring containment (`offset:12` must not match offset 1123). */
export const NUMERIC_FIELDS = new Set(['partition', 'offset']);

/** Backslash-escapes `\` and `"` so the result can sit safely inside a `"..."`-quoted value. */
const escapeForQuoting = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Quotes a value when it needs to be — contains whitespace (including just leading/trailing) or
 * an embedded `"` — so it round-trips exactly through `parseFilterInput` instead of being split
 * on a space or misread at an embedded quote.
 */
const quoteIfNeeded = (value: string): string =>
  NEEDS_QUOTING_PATTERN.test(value) ? `"${escapeForQuoting(value)}"` : value;

/**
 * Fixed operator↔symbol pairs — the single source of truth `parseOperator` and
 * `fieldTokenText` both read from, so adding an operator is a one-line change instead of
 * needing a matching edit in two independently-hand-written places (how `<=`/`>=` first
 * shipped able to *display* but not *parse*, and vice versa).
 *
 * Order matters for parsing: listed so a multi-character symbol is tried before any
 * shorter symbol it starts with (`>=`/`<=` before `>`/`<`), otherwise the shorter symbol
 * would match first and strand a `=` in the value. `eq`'s `=` is included for parsing,
 * but deliberately left out of `DISPLAY_OP_SYMBOLS` below — see that comment.
 */
const OPERATOR_SYMBOLS: [symbol: string, op: FilterOp][] = [
  ['!=', 'neq'],
  ['>=', 'gte'],
  ['<=', 'lte'],
  ['>', 'gt'],
  ['<', 'lt'],
  ['=', 'eq'],
];

/**
 * Reverse lookup for `fieldTokenText`, derived from `OPERATOR_SYMBOLS` minus `eq` — `eq`'s
 * display form collapses to `:` (indistinguishable from `contains`); `tokenQueryText` is the
 * one place that needs `eq` spelled out as `=`, and it does so itself after calling
 * `fieldTokenText`, to keep it round-trippable in the URL.
 */
const DISPLAY_OP_SYMBOLS = new Map(
  OPERATOR_SYMBOLS.filter(([, op]) => op !== 'eq').map(([symbol, op]): [FilterOp, string] => [op, symbol])
);

/**
 * Renders `field op value` back to its typed-input spelling for a given operator, e.g.
 * `offset>48210`, `key!=abc`; `eq` and `contains` both fall through to `field:value`.
 * `formatTokenText`/`tokenEditText`/`tokenQueryText` each pass in an already
 * appropriately-encoded `value` (raw, quote-wrapped, or as-is).
 */
const fieldTokenText = (token: FieldFilterToken, value: string): string => {
  const symbol = DISPLAY_OP_SYMBOLS.get(token.op);
  return symbol ? `${token.field}${symbol}${value}` : `${token.field}:${value}`;
};

/**
 * Compact chip text, mirroring the design mock: `partition:2`, `offset>48210`, `key!=abc`, `ƒ name`.
 * This is the read-only display form shown on a committed chip — unlike `tokenEditText`, the value
 * is never quote-wrapped, so it's not meant to be parsed back with `parseFilterInput`.
 */
export function formatTokenText(token: FilterToken): string {
  if (token.kind === 'js') {
    return `ƒ ${token.name || token.code}`;
  }
  return fieldTokenText(token, token.value);
}

/**
 * Text placed back into the filter input when a chip is unwrapped for editing.
 * A value containing whitespace is quote-wrapped so retyping doesn't risk the
 * filter bar's space-triggered auto-commit cutting it short again.
 */
export function tokenEditText(token: FilterToken): string {
  if (token.kind === 'js') {
    return token.code;
  }
  return fieldTokenText(token, quoteIfNeeded(token.value));
}

/**
 * Lossless text form for URL persistence: unlike the display text (which collapses `eq` to `:`),
 * `eq` serializes as `=` so `parseFilterInput` round-trips the operator exactly, and the value is
 * quoted whenever needed (see `quoteIfNeeded`) so it round-trips exactly too, not just the op.
 */
export function tokenQueryText(token: FieldFilterToken): string {
  const value = quoteIfNeeded(token.value);
  return token.op === 'eq' ? `${token.field}=${value}` : fieldTokenText(token, value);
}

/**
 * Structural equality for two field-token arrays — same field/op/value in
 * the same order. The single comparator for "did this token list actually
 * change," shared by the filter bar's own resync check and the URL
 * persistence layer's `eq`, so a fix to one always reaches the other.
 */
export function sameFieldTokens(a: FieldFilterToken[], b: FieldFilterToken[]): boolean {
  return a.length === b.length && a.every((t, i) => tokenQueryText(t) === tokenQueryText(b[i]));
}

/**
 * Reads the operator and raw (still-encoded) value off `rest` — the text immediately following
 * the matched field name. Null when `rest` doesn't start with a recognized operator.
 */
function parseOperator(field: string, rest: string): { op: FilterOp; rawValue: string } | null {
  for (const [symbol, op] of OPERATOR_SYMBOLS) {
    if (rest.startsWith(symbol)) {
      return { op, rawValue: rest.slice(symbol.length) };
    }
  }
  if (rest.startsWith(':')) {
    // `:` means equality for enumerable/numeric fields (partition, offset) and contains for
    // free-text fields — `offset:12` matching offset 1123 via substring containment is not
    // what anyone typing an offset means.
    return { op: NUMERIC_FIELDS.has(field) ? 'eq' : 'contains', rawValue: rest.slice(1) };
  }
  return null;
}

/** True when a partition value is outside `[0, partitionCount)` — unknowable, so unchecked, when `partitionCount` is omitted. */
function isOutOfRangePartition(field: string, value: string, partitionCount: number | undefined): boolean {
  return field === 'partition' && partitionCount !== undefined && Number(value) >= partitionCount;
}

/**
 * Parse a typed token like `partition:2`, `offset>48210`, `value.address.city:Berlin`
 * or `key!=abc`. Returns null when the text is not a recognized `field op value` form
 * (plain full-text stays live in the bar instead of becoming a token).
 *
 * A value may be quoted (`value:"New York"`) to keep spaces intact — this doubles as
 * the incomplete-input signal while the closing quote hasn't been typed yet, so an
 * unterminated quote (`value:"New`) returns null rather than a partial value. That's
 * what lets the filter bar's space-triggered auto-commit safely skip spaces typed
 * inside an open quote without any separate "is a quote open" tracking.
 */
export function parseFilterInput(
  text: string,
  options?: { partitionCount?: number }
): { field: string; op: FilterOp; value: string } | null {
  const trimmed = text.trim();
  const fieldMatch = FIELD_PATTERN.exec(trimmed);
  if (!fieldMatch) {
    return null;
  }

  const field = fieldMatch[1];
  const operator = parseOperator(field, trimmed.slice(field.length));
  if (!operator) {
    return null;
  }
  const { op, rawValue } = operator;

  // Partition is a single exact match, not a range — `partition>2`/`partition<2`/`partition!=2`
  // would otherwise silently collapse to "partition equals 2" downstream (parseFilterLine only
  // ever reads the value, never the operator, for this field). Reject rather than misparse so the
  // text stays live in the bar instead of quietly doing something other than what was typed.
  if (field === 'partition' && op !== 'eq') {
    return null;
  }

  const value = decodeValue(rawValue.trim());
  if (value === null || (NUMERIC_FIELDS.has(field) && !INTEGER_VALUE_PATTERN.test(value))) {
    // A non-numeric value for a numeric field (typo, or the incomplete "partition:-" while
    // typing "partition:-1") must stay unrecognized rather than becoming a token —
    // `Number(value)` downstream would be NaN, and NaN can never compare equal to
    // itself, which desyncs every "did this change" check built on top of this.
    return null;
  }

  // Out-of-range partition, when the topic's partition count is known — `partition:9999` on a
  // 3-partition topic would otherwise reach the backend as a real request instead of staying
  // live text the user can still correct.
  if (isOutOfRangePartition(field, value, options?.partitionCount)) {
    return null;
  }

  return { field, op, value };
}

/**
 * Reads a `"`-delimited value starting at index 0 of `rawValue` (which must itself start with
 * `"`), honoring `\"`/`\\` escapes. Returns the decoded value and how many characters of
 * `rawValue` the quoted span consumed, or null when the quote never closes.
 */
function readQuotedValue(rawValue: string): { value: string; length: number } | null {
  let value = '';
  let i = 1;
  while (i < rawValue.length) {
    const ch = rawValue[i];
    if (ch === '\\' && i + 1 < rawValue.length) {
      value += rawValue[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') {
      return { value, length: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return null;
}

/** Strips a value's surrounding quotes if present; null for an empty or unterminated-quote value, or
 * for trailing content after the closing quote (shouldn't happen given a whole tokenized word, but
 * guarded rather than silently dropped). */
function decodeValue(rawValue: string): string | null {
  if (!rawValue.startsWith('"')) {
    return rawValue.length > 0 ? rawValue : null;
  }
  const read = readQuotedValue(rawValue);
  if (!read || read.length !== rawValue.length) {
    return null;
  }
  return read.value.length > 0 ? read.value : null;
}

/** True when the text looks like a JavaScript predicate rather than a field token or plain text. */
export function looksLikeJs(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith('js:') || trimmed.startsWith('javascript:')) {
    return true;
  }
  return /return |=>|[=!<>]==?|&&|\|\||[();{}]/.test(trimmed) && !parseFilterInput(trimmed);
}

const JS_CODE_LIKE_PATTERN = /return\b|=>|[=!<>]==?|&&|\|\||[();{}[\].]/;

/**
 * True when text already stripped of a `js:`/`javascript:` prefix reads like
 * an actual JS expression (has an operator, keyword, or code punctuation)
 * rather than a plain label. Lets `js:dach-region` seed the new filter's
 * name instead of dropping "dach-region" in as code the user never wrote.
 */
export function looksLikeJsCode(code: string): boolean {
  return JS_CODE_LIKE_PATTERN.test(code);
}

/** Strip a `js:` / `javascript:` prefix from typed input, returning the code. */
export function stripJsPrefix(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('js:')) {
    return trimmed.slice(3).trim();
  }
  if (trimmed.startsWith('javascript:')) {
    return trimmed.slice('javascript:'.length).trim();
  }
  return trimmed;
}
