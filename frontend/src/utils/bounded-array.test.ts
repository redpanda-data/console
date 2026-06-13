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

import { appendWithSlackCap, boundedAppend, pruneMapToKeys, trimToLast } from './bounded-array';

describe('boundedAppend', () => {
  test('appends an item when under the cap', () => {
    expect(boundedAppend([1, 2], 3, 5)).toEqual([1, 2, 3]);
  });

  test('drops the oldest entries when the cap is exceeded', () => {
    expect(boundedAppend([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });

  test('returns a new array and does not mutate the input', () => {
    const input = [1, 2];
    const result = boundedAppend(input, 3, 5);
    expect(input).toEqual([1, 2]);
    expect(result).not.toBe(input);
  });
});

describe('trimToLast', () => {
  test('trims a buffer in place to the last max entries', () => {
    const buffer = [1, 2, 3, 4, 5];
    trimToLast(buffer, 2);
    expect(buffer).toEqual([4, 5]);
  });

  test('leaves the buffer unchanged when within the cap', () => {
    const buffer = [1, 2];
    trimToLast(buffer, 5);
    expect(buffer).toEqual([1, 2]);
  });
});

describe('pruneMapToKeys', () => {
  test('keeps only entries whose key is in validKeys', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const result = pruneMapToKeys(map, new Set(['a', 'c']));
    expect([...result.entries()]).toEqual([
      ['a', 1],
      ['c', 3],
    ]);
  });

  test('returns an empty map when no keys are valid', () => {
    expect(pruneMapToKeys(new Map([['a', 1]]), new Set<string>()).size).toBe(0);
  });

  test('does not mutate the input map', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    pruneMapToKeys(map, new Set(['a']));
    expect(map.size).toBe(2);
  });
});

describe('appendWithSlackCap', () => {
  test('appends without trimming until length exceeds max + slack', () => {
    const buffer: number[] = [];
    for (let i = 0; i < 5; i++) {
      appendWithSlackCap(buffer, i, 3, 2); // max 3 + slack 2 = 5, not yet exceeded
    }
    expect(buffer).toEqual([0, 1, 2, 3, 4]);
  });

  test('trims to max keeping the newest once past max + slack', () => {
    const buffer: number[] = [];
    for (let i = 0; i < 6; i++) {
      appendWithSlackCap(buffer, i, 3, 2); // the 6th push exceeds 5 and trims to the last 3
    }
    expect(buffer).toEqual([3, 4, 5]);
  });
});
