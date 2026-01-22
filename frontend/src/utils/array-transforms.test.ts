import { describe, expect, it } from 'vitest';

import { filterMap, partition, partitionBy } from './array-transforms';

describe('filterMap', () => {
  it('filters and maps in a single pass', () => {
    const numbers = [1, 2, 3, 4, 5];
    const result = filterMap(numbers, (n) => (n > 2 ? n * 2 : undefined));
    expect(result).toEqual([6, 8, 10]);
  });

  it('returns empty array when all items are filtered out', () => {
    const numbers = [1, 2, 3];
    const result = filterMap(numbers, () => undefined);
    expect(result).toEqual([]);
  });

  it('returns all mapped items when none are filtered', () => {
    const numbers = [1, 2, 3];
    const result = filterMap(numbers, (n) => n * 10);
    expect(result).toEqual([10, 20, 30]);
  });

  it('handles empty array', () => {
    const result = filterMap([], (x) => x);
    expect(result).toEqual([]);
  });

  it('provides index to callback', () => {
    const letters = ['a', 'b', 'c'];
    const result = filterMap(letters, (letter, index) => (index > 0 ? `${letter}${index}` : undefined));
    expect(result).toEqual(['b1', 'c2']);
  });

  it('handles type transformation', () => {
    const strings = ['1', '2', 'x', '3', 'y'];
    const result = filterMap(strings, (s) => {
      const num = Number.parseInt(s, 10);
      return Number.isNaN(num) ? undefined : num;
    });
    expect(result).toEqual([1, 2, 3]);
  });

  it('treats null as a valid value (only undefined filters)', () => {
    const values = [1, 2, 3];
    const result = filterMap(values, (n) => (n === 2 ? null : n));
    expect(result).toEqual([1, null, 3]);
  });
});

describe('partition', () => {
  it('partitions into multiple buckets', () => {
    const numbers = [1, 2, 3, 4, 5, 6];
    const [even, odd] = partition(numbers, (n) => (n % 2 === 0 ? 0 : 1), 2);
    expect(even).toEqual([2, 4, 6]);
    expect(odd).toEqual([1, 3, 5]);
  });

  it('handles three buckets', () => {
    const items = [{ size: 5 }, { size: 50 }, { size: 150 }, { size: 8 }, { size: 200 }];
    const [small, medium, large] = partition(
      items,
      (item) => {
        if (item.size < 10) return 0;
        if (item.size < 100) return 1;
        return 2;
      },
      3
    );
    expect(small).toEqual([{ size: 5 }, { size: 8 }]);
    expect(medium).toEqual([{ size: 50 }]);
    expect(large).toEqual([{ size: 150 }, { size: 200 }]);
  });

  it('returns empty buckets when no items match', () => {
    const numbers = [1, 3, 5];
    const [even, odd] = partition(numbers, (n) => (n % 2 === 0 ? 0 : 1), 2);
    expect(even).toEqual([]);
    expect(odd).toEqual([1, 3, 5]);
  });

  it('handles empty array', () => {
    const result = partition([], () => 0, 3);
    expect(result).toEqual([[], [], []]);
  });

  it('ignores items with out-of-range bucket indices', () => {
    const numbers = [1, 2, 3];
    const result = partition(numbers, (n) => (n === 2 ? 5 : 0), 2);
    expect(result).toEqual([[1, 3], []]);
  });

  it('ignores negative bucket indices', () => {
    const numbers = [1, 2, 3];
    const result = partition(numbers, (n) => (n === 2 ? -1 : 0), 2);
    expect(result).toEqual([[1, 3], []]);
  });
});

describe('partitionBy', () => {
  it('splits array by predicate into [matching, nonMatching]', () => {
    const numbers = [1, 2, 3, 4, 5];
    const [evens, odds] = partitionBy(numbers, (n) => n % 2 === 0);
    expect(evens).toEqual([2, 4]);
    expect(odds).toEqual([1, 3, 5]);
  });

  it('handles all matching', () => {
    const numbers = [2, 4, 6];
    const [evens, odds] = partitionBy(numbers, (n) => n % 2 === 0);
    expect(evens).toEqual([2, 4, 6]);
    expect(odds).toEqual([]);
  });

  it('handles none matching', () => {
    const numbers = [1, 3, 5];
    const [evens, odds] = partitionBy(numbers, (n) => n % 2 === 0);
    expect(evens).toEqual([]);
    expect(odds).toEqual([1, 3, 5]);
  });

  it('handles empty array', () => {
    const [matching, nonMatching] = partitionBy([], () => true);
    expect(matching).toEqual([]);
    expect(nonMatching).toEqual([]);
  });

  it('works with objects', () => {
    const users = [
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 17 },
      { name: 'Charlie', age: 30 },
    ];
    const [adults, minors] = partitionBy(users, (user) => user.age >= 18);
    expect(adults).toEqual([
      { name: 'Alice', age: 25 },
      { name: 'Charlie', age: 30 },
    ]);
    expect(minors).toEqual([{ name: 'Bob', age: 17 }]);
  });

  it('preserves original order within partitions', () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
    const [evens, odds] = partitionBy(numbers, (n) => n % 2 === 0);
    expect(evens).toEqual([2, 4, 6, 8]);
    expect(odds).toEqual([1, 3, 5, 7]);
  });
});
