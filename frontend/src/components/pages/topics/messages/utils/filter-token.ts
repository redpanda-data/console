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

export const OP_LABELS: Record<FilterOp, string> = {
  contains: 'contains',
  eq: '=',
  neq: '≠',
  gt: '>',
  lt: '<',
};

/** Fields that can appear in a typed `field:value` token. `value.<path>` accessors are also valid fields. */
export const FILTER_FIELDS = ['key', 'value', 'partition', 'offset'] as const;

const FIELD_PATTERN = /^(key|value(?:\.[\w.*-]+)?|partition|offset)/;
const QUOTED_VALUE_PATTERN = /^"([^"]*)"$/;

const fieldTokenText = (token: FieldFilterToken, value: string): string => {
  switch (token.op) {
    case 'gt':
      return `${token.field}>${value}`;
    case 'lt':
      return `${token.field}<${value}`;
    case 'neq':
      return `${token.field}!=${value}`;
    default:
      return `${token.field}:${value}`;
  }
};

/** Compact chip text, mirroring the design mock: `partition:2`, `offset>48210`, `key!=abc`, `ƒ name`. */
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
  return fieldTokenText(token, token.value.includes(' ') ? `"${token.value}"` : token.value);
}

/**
 * Lossless text form for URL persistence: unlike the display text (which
 * collapses `eq` to `:`), `eq` serializes as `=` so `parseFilterInput`
 * round-trips the operator exactly.
 */
export function tokenQueryText(token: FieldFilterToken): string {
  return token.op === 'eq' ? `${token.field}=${token.value}` : formatTokenText(token);
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
export function parseFilterInput(text: string): { field: string; op: FilterOp; value: string } | null {
  const trimmed = text.trim();
  const fieldMatch = FIELD_PATTERN.exec(trimmed);
  if (!fieldMatch) {
    return null;
  }

  const field = fieldMatch[1];
  const rest = trimmed.slice(field.length);

  let op: FilterOp;
  let rawValue: string;
  if (rest.startsWith('!=')) {
    op = 'neq';
    rawValue = rest.slice(2);
  } else if (rest.startsWith('>')) {
    op = 'gt';
    rawValue = rest.slice(1);
  } else if (rest.startsWith('<')) {
    op = 'lt';
    rawValue = rest.slice(1);
  } else if (rest.startsWith('=')) {
    op = 'eq';
    rawValue = rest.slice(1);
  } else if (rest.startsWith(':')) {
    // `:` means equality for enumerable fields (partition) and contains for text fields
    op = field === 'partition' ? 'eq' : 'contains';
    rawValue = rest.slice(1);
  } else {
    return null;
  }

  rawValue = rawValue.trim();

  let value: string;
  if (rawValue.startsWith('"')) {
    const closed = QUOTED_VALUE_PATTERN.exec(rawValue);
    if (!closed) {
      return null;
    }
    value = closed[1];
  } else {
    value = rawValue;
  }

  if (value.length === 0) {
    return null;
  }

  return { field, op, value };
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
