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

import { arraysEqual } from './shadowlink-edit-utils';

describe('arraysEqual', () => {
  test.each([
    {
      description: 'both arrays empty',
      arrayA: [],
      arrayB: [],
      expected: true,
    },
    {
      description: 'same values in same order',
      arrayA: ['a', 'b', 'c'],
      arrayB: ['a', 'b', 'c'],
      expected: true,
    },
    {
      description: 'single identical element',
      arrayA: ['test'],
      arrayB: ['test'],
      expected: true,
    },
    {
      description: 'different values',
      arrayA: ['a', 'b'],
      arrayB: ['a', 'c'],
      expected: false,
    },
    {
      description: 'different lengths - first shorter',
      arrayA: ['a'],
      arrayB: ['a', 'b'],
      expected: false,
    },
    {
      description: 'different lengths - second shorter',
      arrayA: ['a', 'b'],
      arrayB: ['a'],
      expected: false,
    },
    {
      description: 'different order (order-independent)',
      arrayA: ['a', 'b'],
      arrayB: ['b', 'a'],
      expected: true,
    },
    {
      description: 'completely different values',
      arrayA: ['x', 'y', 'z'],
      arrayB: ['1', '2', '3'],
      expected: false,
    },
    {
      description: 'first empty, second not',
      arrayA: [],
      arrayB: ['a'],
      expected: false,
    },
    {
      description: 'first not empty, second empty',
      arrayA: ['a'],
      arrayB: [],
      expected: false,
    },
    {
      description: 'duplicate values in same positions',
      arrayA: ['a', 'a', 'b'],
      arrayB: ['a', 'a', 'b'],
      expected: true,
    },
    {
      description: 'duplicate values in different positions (order-independent)',
      arrayA: ['a', 'b', 'a'],
      arrayB: ['a', 'a', 'b'],
      expected: true,
    },
  ])('should return $expected when $description', ({ arrayA, arrayB, expected }) => {
    const result = arraysEqual(arrayA, arrayB);
    expect(result).toBe(expected);
  });
});
