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

import { describe, expect, test } from 'vitest';

import { distinctFieldValues, matchesFieldFilter, resolveField, valuePaths } from './client-match';
import type { TopicMessage } from '../../../../../state/rest-interfaces';

const makeMsg = (overrides: { offset?: number; partitionID?: number; key?: unknown; value?: unknown }): TopicMessage =>
  ({
    partitionID: overrides.partitionID ?? 0,
    offset: overrides.offset ?? 1,
    timestamp: 0,
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: { payload: overrides.key ?? 'k', isPayloadNull: overrides.key === null, size: 1 },
    value: { payload: overrides.value ?? {}, isPayloadNull: overrides.value === null, size: 1 },
    keyJson: JSON.stringify(overrides.key ?? 'k'),
    valueJson: JSON.stringify(overrides.value ?? {}),
    keyBinHexPreview: '',
    valueBinHexPreview: '',
  }) as TopicMessage;

describe('resolveField', () => {
  const msg = makeMsg({ offset: 42, partitionID: 2, key: 'abc', value: { address: { city: 'Berlin' }, version: 3 } });

  test('resolves scalar fields', () => {
    expect(resolveField(msg, 'offset')).toBe(42);
    expect(resolveField(msg, 'partition')).toBe(2);
    expect(resolveField(msg, 'key')).toBe('abc');
  });

  test('resolves nested value paths', () => {
    expect(resolveField(msg, 'value.address.city')).toBe('Berlin');
    expect(resolveField(msg, 'value.version')).toBe(3);
    expect(resolveField(msg, 'value.missing.path')).toBeUndefined();
  });
});

describe('matchesFieldFilter', () => {
  const msg = makeMsg({ offset: 100, key: 'user-7', value: { type: 'INVOICE', version: 0 } });

  test('contains is case-insensitive', () => {
    expect(matchesFieldFilter(msg, 'key', 'contains', 'USER')).toBe(true);
    expect(matchesFieldFilter(msg, 'value.type', 'contains', 'invoice')).toBe(true);
    expect(matchesFieldFilter(msg, 'key', 'contains', 'nope')).toBe(false);
  });

  test('eq/neq compare stringified values', () => {
    expect(matchesFieldFilter(msg, 'value.version', 'eq', '0')).toBe(true);
    expect(matchesFieldFilter(msg, 'value.version', 'neq', '1')).toBe(true);
    expect(matchesFieldFilter(msg, 'partition', 'eq', '0')).toBe(true);
  });

  test('gt/lt compare numerically', () => {
    expect(matchesFieldFilter(msg, 'offset', 'gt', '99')).toBe(true);
    expect(matchesFieldFilter(msg, 'offset', 'lt', '99')).toBe(false);
    expect(matchesFieldFilter(msg, 'key', 'gt', '5')).toBe(false);
  });
});

describe('distinctFieldValues', () => {
  const messages = [
    makeMsg({ partitionID: 0 }),
    makeMsg({ partitionID: 0 }),
    makeMsg({ partitionID: 1 }),
    makeMsg({ partitionID: 2 }),
  ];

  test('returns count-sorted distinct values', () => {
    expect(distinctFieldValues(messages, 'partition', '')).toEqual([
      { value: '0', count: 2 },
      { value: '1', count: 1 },
      { value: '2', count: 1 },
    ]);
  });

  test('filters by typed query', () => {
    expect(distinctFieldValues(messages, 'partition', '2')).toEqual([{ value: '2', count: 1 }]);
  });
});

describe('valuePaths', () => {
  const messages = [
    makeMsg({ value: { address: { city: 'Berlin', zip: '10115' }, name: 'a' } }),
    makeMsg({ value: { version: 1 } }),
  ];

  test('collects nested dotted paths across rows', () => {
    expect(valuePaths(messages)).toEqual(['address', 'address.city', 'address.zip', 'name', 'version']);
  });

  test('prefix matches sort before substring matches', () => {
    expect(valuePaths(messages, 'address')).toEqual(['address', 'address.city', 'address.zip']);
    expect(valuePaths(messages, 'city')[0]).toBe('address.city');
  });
});
