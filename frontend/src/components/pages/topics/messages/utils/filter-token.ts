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

/** Compact chip text, mirroring the design mock: `partition:2`, `offset>48210`, `key!=abc`, `ƒ name`. */
export function formatTokenText(token: FilterToken): string {
  if (token.kind === 'js') {
    return `ƒ ${token.name || token.code}`;
  }
  switch (token.op) {
    case 'gt':
      return `${token.field}>${token.value}`;
    case 'lt':
      return `${token.field}<${token.value}`;
    case 'neq':
      return `${token.field}!=${token.value}`;
    default:
      return `${token.field}:${token.value}`;
  }
}

/** Text placed back into the filter input when a chip is clicked for editing. */
export function tokenEditText(token: FilterToken): string {
  if (token.kind === 'js') {
    return token.code;
  }
  return formatTokenText(token);
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
  let value: string;
  if (rest.startsWith('!=')) {
    op = 'neq';
    value = rest.slice(2);
  } else if (rest.startsWith('>')) {
    op = 'gt';
    value = rest.slice(1);
  } else if (rest.startsWith('<')) {
    op = 'lt';
    value = rest.slice(1);
  } else if (rest.startsWith('=')) {
    op = 'eq';
    value = rest.slice(1);
  } else if (rest.startsWith(':')) {
    // `:` means equality for enumerable fields (partition) and contains for text fields
    op = field === 'partition' ? 'eq' : 'contains';
    value = rest.slice(1);
  } else {
    return null;
  }

  value = value.trim();
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
