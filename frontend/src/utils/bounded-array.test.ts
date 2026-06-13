import { describe, expect, test } from 'vitest';

import { boundedAppend, pruneMapToKeys, trimToLast } from './bounded-array';

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
