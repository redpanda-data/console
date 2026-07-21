/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, test } from 'vitest';

import { filterByName } from './filter-by-name';

const items = [{ name: 'alice' }, { name: 'Bob' }, { name: 'charlie' }, { name: 'ALICE-admin' }];
const getName = (item: { name: string }) => item.name;

describe('filterByName', () => {
  test('returns all items when query is empty', () => {
    expect(filterByName(items, '', getName)).toEqual(items);
  });

  test('filters case-insensitively', () => {
    const result = filterByName(items, 'alice', getName);
    expect(result.map((i) => i.name)).toEqual(['alice', 'ALICE-admin']);
  });

  test('supports regex patterns', () => {
    const result = filterByName(items, '^bob$', getName);
    expect(result.map((i) => i.name)).toEqual(['Bob']);
  });

  test('falls back to substring match on invalid regex', () => {
    const result = filterByName(items, '[invalid(', getName);
    expect(result).toEqual([]);
  });

  test('substring fallback is case-insensitive', () => {
    const result = filterByName(items, '[invalid(', getName);
    // Invalid regex, falls back to substring — no items contain "[invalid("
    expect(result).toHaveLength(0);
  });

  test('matches partial names', () => {
    const result = filterByName(items, 'li', getName);
    expect(result.map((i) => i.name)).toEqual(['alice', 'charlie', 'ALICE-admin']);
  });
});
