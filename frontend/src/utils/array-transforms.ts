/**
 * Single-pass filter and map operation.
 * More efficient than chaining .filter().map() as it only iterates once.
 *
 * @example
 * // Instead of: arr.filter(x => x > 0).map(x => x * 2)
 * filterMap(arr, x => x > 0 ? x * 2 : undefined)
 */
export function filterMap<T, U>(array: readonly T[], fn: (item: T, index: number) => U | undefined): U[] {
  const result: U[] = [];
  for (let i = 0; i < array.length; i++) {
    const mapped = fn(array[i], i);
    if (mapped !== undefined) {
      result.push(mapped);
    }
  }
  return result;
}

/**
 * Split an array into multiple buckets based on a classifier function.
 * Single-pass operation, more efficient than multiple .filter() calls.
 *
 * @example
 * const [even, odd] = partition(numbers, n => n % 2 === 0 ? 0 : 1, 2);
 *
 * @example
 * const [small, medium, large] = partition(items, item => {
 *   if (item.size < 10) return 0;
 *   if (item.size < 100) return 1;
 *   return 2;
 * }, 3);
 */
export function partition<T>(array: readonly T[], classifier: (item: T) => number, bucketCount: number): T[][] {
  const buckets: T[][] = Array.from({ length: bucketCount }, () => []);
  for (const item of array) {
    const bucket = classifier(item);
    if (bucket >= 0 && bucket < bucketCount) {
      buckets[bucket].push(item);
    }
  }
  return buckets;
}

/**
 * Simple two-way partition based on a predicate.
 * Returns [matching, nonMatching] arrays.
 *
 * @example
 * const [adults, minors] = partitionBy(users, user => user.age >= 18);
 */
export function partitionBy<T>(array: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
  const matching: T[] = [];
  const nonMatching: T[] = [];
  for (const item of array) {
    if (predicate(item)) {
      matching.push(item);
    } else {
      nonMatching.push(item);
    }
  }
  return [matching, nonMatching];
}
