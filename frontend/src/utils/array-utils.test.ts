import {
  arrayCount,
  arrayDistinct,
  arrayExcept,
  arrayFilterFalsy,
  arrayFilterNull,
  arrayFirst,
  arrayGenericJoin,
  arrayGroupBy,
  arrayGroupInto,
  arrayIntersection,
  arrayIsEqual,
  arrayJoinStr,
  arrayLast,
  arrayMax,
  arrayMaxBy,
  arrayMin,
  arrayMinBy,
  arrayOrderBy,
  arrayPushDistinct,
  arrayRemove,
  arrayRemoveAll,
  arraySum,
  arrayToMap,
  arrayUpdateWith,
} from './array-utils';
import { describe, expect, test } from 'bun:test';

describe('array operations', () => {
  test('finds the first and last matching items, including zero', () => {
    const values = [0, 2, 4, 3];
    expect(arrayFirst(values)).toBe(0);
    expect(arrayFirst(values, (value) => value > 1)).toBe(2);
    expect(arrayLast(values)).toBe(3);
    expect(arrayLast(values, (value) => value % 2 === 0)).toBe(4);
    expect(arrayFirst(values, (value) => value > 9)).toBeUndefined();
    expect(arrayLast(values, (value) => value > 9)).toBeUndefined();
  });
  test('retains null-filter and truthy-filter semantics', () => {
    const values = [0, false, '', null, undefined, 'present'];
    expect(arrayFilterNull(values)).toEqual([0, false, '', undefined, 'present']);
    expect(arrayFilterFalsy(values)).toEqual(['present']);
  });
  test('counts and sums only present array entries', () => {
    const values = [2];
    values.length = 3;
    values[2] = 4;
    expect(arrayCount(values, (value) => value > 1)).toBe(2);
    expect(arraySum(values, (value) => value)).toBe(6);
  });
  test('preserves empty-array extrema and NaN comparisons', () => {
    const values: number[] = [];
    expect(arrayMin(values, (value) => value)).toBe(Number.POSITIVE_INFINITY);
    expect(arrayMax(values, (value) => value)).toBe(Number.NEGATIVE_INFINITY);
    expect(arrayMin([Number.NaN, 2, 4], (value) => value)).toBe(2);
    expect(arrayMax([Number.NaN, 2, 4], (value) => value)).toBe(4);
    expect(arrayMinBy(values, (value) => value)).toBeUndefined();
    expect(arrayMaxBy(values, (value) => value)).toBeUndefined();
  });
  test('keeps the first item when extrema are tied', () => {
    const first = { value: 2 };
    const second = { value: 2 };
    expect(arrayMinBy([first, second], (item) => item.value)).toBe(first);
    expect(arrayMaxBy([first, second], (item) => item.value)).toBe(first);
  });
  test('groups by object identity and keeps insertion order', () => {
    const first = {};
    const second = {};
    const values = [
      { key: first, value: 1 },
      { key: second, value: 2 },
      { key: first, value: 3 },
    ];
    const groups = arrayGroupBy(values, (item) => item.key);
    expect([...groups.keys()]).toEqual([first, second]);
    expect(groups.get(first)).toEqual([values[0], values[2]]);
    expect(arrayGroupInto(values, (item) => item.key)).toEqual([
      { key: first, items: [values[0], values[2]] },
      { key: second, items: [values[1]] },
    ]);
  });
  test('retains distinct selection and set-operation ordering', () => {
    const values = [{ id: 1 }, { id: 2 }, { id: 1 }];
    expect(arrayDistinct(values, (item) => item.id)).toEqual([values[0], values[1]]);
    expect(arrayDistinct([1, 1, 2])).toEqual([1, 2]);
    expect(arrayExcept([1, 1, 2], [2])).toEqual([1, 1]);
    expect(arrayIntersection([1, 2], [2, 2, 1])).toEqual([2, 2, 1]);
  });
  test('mutates the same array when removing and updating items', () => {
    const values = [1, 2, 3, 4];
    expect(arrayRemove(values, 9)).toBe(false);
    expect(arrayRemove(values, 2)).toBe(true);
    expect(arrayRemoveAll(values, (value) => value % 2 === 0)).toBe(1);
    expect(values).toEqual([1, 3]);
    expect(arrayUpdateWith(values, [3, 5])).toEqual({ added: 1, removed: 1 });
    expect(values).toEqual([3, 5]);
  });
  test('keeps shared item order and adds distinct values', () => {
    const values = [1, 2];
    expect(arrayUpdateWith(values, [2, 1])).toEqual({ added: 0, removed: 0 });
    expect(values).toEqual([1, 2]);
    arrayPushDistinct(values, 2, 3);
    expect(values).toEqual([1, 2, 3]);
  });
  test('joins, maps and sorts without mutating the source', () => {
    const values = [3, 1, 2];
    expect(arrayGenericJoin(values, () => 0)).toEqual([3, 0, 1, 0, 2]);
    expect(arrayJoinStr(['', null, 'a', undefined, 'b'], ',')).toBe('a,b');
    expect(
      arrayToMap(
        values,
        (value) => value,
        (value) => String(value)
      )
    ).toEqual(
      new Map([
        [3, '3'],
        [1, '1'],
        [2, '2'],
      ])
    );
    expect(arrayOrderBy(values, (value) => value)).toEqual([1, 2, 3]);
    expect(values).toEqual([3, 1, 2]);
    expect(arrayIsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(arrayIsEqual(['a', 'b'], ['b', 'a'])).toBe(false);
  });
});

test('nullable inputs preserve optional-chain results', () => {
  expect(arraySum(undefined, (value: number) => value)).toBeUndefined();
  expect(arraySum([], (value: number) => value)).toBe(0);
  expect(arrayGroupInto(null, (value: number) => value)).toBeUndefined();
  expect(arrayGroupInto([], (value: number) => value)).toEqual([]);
  expect(arrayDistinct(undefined)).toBeUndefined();
  expect(arrayDistinct([])).toEqual([]);
  expect(arrayFilterNull(null)).toBeUndefined();
  expect(arrayFilterNull([])).toEqual([]);
});
