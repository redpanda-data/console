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

import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { FilterOp } from '../types';

/**
 * Resolve a filter field against a loaded message: `key`, `partition`, `offset`,
 * `value`, or a `value.<dot.path>` accessor into the decoded value payload.
 * Returns undefined when the path doesn't exist.
 */
export function resolveField(msg: TopicMessage, field: string): unknown {
  switch (field) {
    case 'key':
      return msg.key.isPayloadNull ? undefined : (msg.key.payload ?? msg.keyJson);
    case 'partition':
      return msg.partitionID;
    case 'offset':
      return msg.offset;
    case 'value':
      return msg.valueJson;
    default:
      break;
  }
  if (!field.startsWith('value.')) {
    return;
  }
  let current: unknown = msg.value.isPayloadNull ? undefined : msg.value.payload;
  for (const segment of field.slice('value.'.length).split('.')) {
    if (current === null || typeof current !== 'object') {
      return;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const compareNumeric = (resolved: unknown, value: string, op: 'gt' | 'lt'): boolean => {
  const left = Number(resolved);
  const right = Number(value);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }
  return op === 'gt' ? left > right : left < right;
};

const asComparableString = (resolved: unknown): string =>
  typeof resolved === 'string' ? resolved : (JSON.stringify(resolved) ?? '');

/** Apply one structured `field op value` filter to a loaded message. */
export function matchesFieldFilter(msg: TopicMessage, field: string, op: FilterOp, value: string): boolean {
  const resolved = resolveField(msg, field);
  if (resolved === undefined) {
    // A field that isn't present doesn't equal the filter value either — `neq` should keep
    // the message, not hide it. Every other operator has nothing to compare against.
    return op === 'neq';
  }
  switch (op) {
    case 'contains':
      return asComparableString(resolved).toLowerCase().includes(value.toLowerCase());
    case 'eq':
      return asComparableString(resolved).toLowerCase() === value.toLowerCase();
    case 'neq':
      return asComparableString(resolved).toLowerCase() !== value.toLowerCase();
    case 'gt':
    case 'lt':
      return compareNumeric(resolved, value, op);
    default:
      return false;
  }
}

/**
 * Distinct values of a field across the loaded rows, filtered by an optional
 * typed prefix/substring, sorted by frequency. Powers the suggestion dropdown.
 */
export function distinctFieldValues(
  messages: TopicMessage[],
  field: string,
  query: string,
  limit = 6
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const msg of messages) {
    const resolved = resolveField(msg, field);
    if (resolved === undefined || resolved === null || typeof resolved === 'object') {
      continue;
    }
    const text = String(resolved);
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const needle = query.toLowerCase();
  return [...counts.entries()]
    .filter(([value]) => !needle || value.toLowerCase().includes(needle))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

const MAX_PATH_DEPTH = 4;

const collectPaths = (obj: unknown, prefix: string, depth: number, out: Set<string>) => {
  if (depth > MAX_PATH_DEPTH || obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return;
  }
  for (const [key, child] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.add(path);
    collectPaths(child, path, depth + 1, out);
  }
};

/** Dotted paths that exist under the decoded value payloads of the loaded rows. */
export function valuePaths(messages: TopicMessage[], filter = ''): string[] {
  const paths = new Set<string>();
  for (const msg of messages.slice(0, 50)) {
    if (!msg.value.isPayloadNull) {
      collectPaths(msg.value.payload, '', 0, paths);
    }
  }
  const needle = filter.toLowerCase();
  const all = [...paths].sort();
  if (!needle) {
    return all;
  }
  // Prefix matches first, then substring matches
  const prefixed = all.filter((p) => p.toLowerCase().startsWith(needle));
  const contained = all.filter((p) => !p.toLowerCase().startsWith(needle) && p.toLowerCase().includes(needle));
  return [...prefixed, ...contained];
}
