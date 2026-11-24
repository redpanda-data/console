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

const FIELD_PATTERN = /^(?<field>key|value(?:\.[\w.*-]+)?|partition|offset)/u;
const INTEGER_VALUE_PATTERN = /^\d+$/u;
const NEEDS_QUOTING_PATTERN = /["\s]/u;

/** Fields whose value must be a plain non-negative integer, and whose bare `:` means equality
 * rather than substring containment (`offset:12` must not match offset 1123). */
export const NUMERIC_FIELDS = new Set(['partition', 'offset']);

const escapeForQuoting = (value: string) => value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');

const quoteIfNeeded = (value: string) => (NEEDS_QUOTING_PATTERN.test(value) ? `"${escapeForQuoting(value)}"` : value);

// WARNING: Match longer operator symbols first; putting > before >= strands the equals sign in the value.
const OPERATOR_SYMBOLS: [symbol: string, op: FilterOp][] = [
  ['!=', 'neq'],
  ['>=', 'gte'],
  ['<=', 'lte'],
  ['>', 'gt'],
  ['<', 'lt'],
  ['=', 'eq'],
];

const DISPLAY_OP_SYMBOLS = new Map(
  OPERATOR_SYMBOLS.filter(([, op]) => op !== 'eq').map(([symbol, op]) => [op, symbol])
);

const fieldTokenText = (token: FieldFilterToken, value: string) => {
  const symbol = DISPLAY_OP_SYMBOLS.get(token.op);
  return symbol ? `${token.field}${symbol}${value}` : `${token.field}:${value}`;
};

/**
 * Compact chip text, mirroring the design mock: `partition:2`, `offset>48210`, `key!=abc`, `ƒ name`.
 * This is the read-only display form shown on a committed chip — unlike `tokenEditText`, the value
 * is never quote-wrapped, so it's not meant to be parsed back with `parseFilterInput`.
 */
export function formatTokenText(token: FilterToken) {
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
export function tokenEditText(token: FilterToken) {
  if (token.kind === 'js') {
    return token.code;
  }
  return fieldTokenText(token, quoteIfNeeded(token.value));
}

/**
 * Lossless text form for URL persistence: unlike the display text (which collapses `eq` to `:`),
 * `eq` serializes as `=` so `parseFilterInput` round-trips the operator exactly, and the value is
 * quoted whenever needed (see `quoteIfNeeded`) so it round-trips exactly too, not just the op.
 *
 * The toolbar displays both equality and contains with a colon, but serialization spells equality with = so the URL can recover the exact operation.
 */
export function tokenQueryText(token: FieldFilterToken) {
  const value = quoteIfNeeded(token.value);
  return token.op === 'eq' ? `${token.field}=${value}` : fieldTokenText(token, value);
}

/**
 * Structural equality for two field-token arrays — same field/op/value in
 * the same order. The single comparator for "did this token list actually
 * change," shared by the filter bar's own resync check and the URL
 * persistence layer's `eq`, so a fix to one always reaches the other.
 */
export function sameFieldTokens(a: FieldFilterToken[], b: FieldFilterToken[]) {
  return a.length === b.length && a.every((t, i) => tokenQueryText(t) === tokenQueryText(b[i]));
}

type ParsedOperator = { op: FilterOp; rawValue: string };

function parseOperator(field: string, rest: string) {
  for (const [symbol, op] of OPERATOR_SYMBOLS) {
    if (rest.startsWith(symbol)) {
      return { op, rawValue: rest.slice(symbol.length) } satisfies ParsedOperator;
    }
  }
  if (rest.startsWith(':')) {
    return { op: NUMERIC_FIELDS.has(field) ? 'eq' : 'contains', rawValue: rest.slice(1) } satisfies ParsedOperator;
  }
  return null;
}

function isOutOfRangePartition(field: string, value: string, partitionCount: number | undefined) {
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
 *
 * A colon denotes equality on numeric fields and containment on text fields. Partition accepts only a single exact match in range when the count is known; an unsupported operator or invalid number stays editable rather than becoming an incorrect request.
 *
 * Decode complete quoted values with backslash escapes; partial quotes, trailing junk, or malformed numeric values stay unrecognized.
 */
export function parseFilterInput(text: string, options?: { partitionCount?: number }) {
  const head = parseFieldAndOperator(text.trim());
  if (!head) {
    return null;
  }
  const value = parseFieldValue(head.field, head.rawValue);
  if (value === null) {
    return null;
  }
  if (isOutOfRangePartition(head.field, value, options?.partitionCount)) {
    return null;
  }
  return { field: head.field, op: head.op, value };
}

function parseFieldAndOperator(trimmed: string) {
  const fieldMatch = FIELD_PATTERN.exec(trimmed);
  if (!fieldMatch) {
    return null;
  }
  const field = fieldMatch[1];
  const operator = parseOperator(field, trimmed.slice(field.length));
  if (!operator) {
    return null;
  }
  if (field === 'partition' && operator.op !== 'eq') {
    return null;
  }
  return { field, ...operator };
}

function parseFieldValue(field: string, rawValue: string) {
  const value = decodeValue(rawValue.trim());
  if (value === null || (NUMERIC_FIELDS.has(field) && !INTEGER_VALUE_PATTERN.test(value))) {
    return null;
  }
  return value;
}

function readQuotedValue(rawValue: string) {
  let value = '';
  let i = 1;
  while (i < rawValue.length && rawValue[i] !== '"') {
    const escaped = rawValue[i] === '\\' && i + 1 < rawValue.length;
    value += escaped ? rawValue[i + 1] : rawValue[i];
    i += escaped ? 2 : 1;
  }
  return i < rawValue.length ? { value, length: i + 1 } : null;
}

function decodeValue(rawValue: string) {
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
export function looksLikeJs(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('js:') || trimmed.startsWith('javascript:')) {
    return true;
  }
  return /return |=>|[=!<>]==?|&&|\|\||[();{}]/u.test(trimmed) && !parseFilterInput(trimmed);
}

const JS_CODE_LIKE_PATTERN = /return\b|=>|[=!<>]==?|&&|\|\||[();{}[\].]/u;

/**
 * True when text already stripped of a `js:`/`javascript:` prefix reads like
 * an actual JS expression (has an operator, keyword, or code punctuation)
 * rather than a plain label. Lets `js:dach-region` seed the new filter's
 * name instead of dropping "dach-region" in as code the user never wrote.
 */
export function looksLikeJsCode(code: string) {
  return JS_CODE_LIKE_PATTERN.test(code);
}

/** Strip a `js:` / `javascript:` prefix from typed input, returning the code. */
export function stripJsPrefix(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('js:')) {
    return trimmed.slice(3).trim();
  }
  if (trimmed.startsWith('javascript:')) {
    return trimmed.slice('javascript:'.length).trim();
  }
  return trimmed;
}
