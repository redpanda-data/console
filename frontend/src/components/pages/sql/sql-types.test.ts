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

import { arrayElementPgType, columnKindForPgType, isArrayPgType } from './sql-types';

describe('columnKindForPgType', () => {
  test.each([
    ['INT8', 'num'],
    ['NUMERIC(10,2)', 'num'],
    ['BOOL', 'bool'],
    ['TIMESTAMPTZ', 'time'],
    ['JSON', 'json'],
    ['JSONB', 'json'],
    ['TEXT', 'str'],
    ['UNKNOWN_TYPE', 'str'],
    // Composite columns arrive pre-labelled as "json"/"json[]" from the backend.
    ['json', 'json'],
    ['json[]', 'json'],
  ] as const)('%s → %s', (pgType, kind) => {
    expect(columnKindForPgType(pgType)).toBe(kind);
  });

  test.each([
    ['TEXT[]', 'str'],
    ['_INT4', 'num'],
    ['JSONB[]', 'json'],
    ['ARRAY<STRING>', 'str'],
    ['LIST<TIMESTAMP>', 'time'],
  ] as const)('array %s maps to element kind %s', (pgType, kind) => {
    expect(columnKindForPgType(pgType)).toBe(kind);
  });
});

describe('arrayElementPgType', () => {
  test.each([
    ['TEXT[]', 'TEXT'],
    ['_INT4', 'INT4'],
    ['ARRAY<STRING>', 'STRING'],
    ['list<double>', 'double'],
  ] as const)('%s unwraps to %s', (pgType, element) => {
    expect(arrayElementPgType(pgType)).toBe(element);
  });

  test('non-array types return null', () => {
    expect(arrayElementPgType('TEXT')).toBeNull();
    expect(isArrayPgType('TEXT')).toBe(false);
    expect(isArrayPgType('TEXT[]')).toBe(true);
  });
});
