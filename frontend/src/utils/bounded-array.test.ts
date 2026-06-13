import { describe, expect, test } from 'vitest';

import { boundedAppend, trimToLast } from './bounded-array';

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
