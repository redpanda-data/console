/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

export function arrayRemove<T>(array: T[], obj: T): boolean {
  const index = array.indexOf(obj);
  if (index === -1) {
    return false;
  }
  array.splice(index, 1);
  return true;
}

export function arrayRemoveAll<T>(array: T[], selector: (x: T) => boolean): number {
  let count = 0;
  for (let i = 0; i < array.length; i++) {
    if (!selector(array[i])) {
      continue;
    }
    array.splice(i, 1);
    count += 1;
    i -= 1;
  }
  return count;
}

export function arrayFirst<T>(array: T[], selector?: (x: T) => boolean): T | undefined {
  if (!selector) {
    return array.length > 0 ? array[0] : undefined;
  }
  for (const e of array) {
    if (selector(e)) {
      return e;
    }
  }
}

export function arrayLast<T>(array: T[], selector?: (x: T) => boolean): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    if (!selector || selector(array[i])) {
      return array[i];
    }
  }
}

export function arrayCount<T>(array: T[], selector: (x: T) => boolean) {
  return array.reduce((pre, cur) => (selector(cur) ? pre + 1 : pre), 0);
}

export function arraySum<T>(array: T[], selector: (x: T) => number): number;
export function arraySum<T>(array: T[] | null | undefined, selector: (x: T) => number): number | undefined;
export function arraySum<T>(array: T[] | null | undefined, selector: (x: T) => number): number | undefined {
  if (array === null || array === undefined) {
    return undefined;
  }
  return array.reduce((pre, cur) => pre + selector(cur), 0);
}

export function arrayMin<T>(array: T[], selector: (x: T) => number) {
  let cur = Number.POSITIVE_INFINITY;
  for (const item of array) {
    const value = selector(item);
    if (value < cur) {
      cur = value;
    }
  }
  return cur;
}

export function arrayMax<T>(array: T[], selector: (x: T) => number) {
  let cur = Number.NEGATIVE_INFINITY;
  for (const item of array) {
    const value = selector(item);
    if (value > cur) {
      cur = value;
    }
  }
  return cur;
}

export function arrayMinBy<T>(array: T[], selector: (x: T) => number) {
  if (array.length === 0) {
    return;
  }
  let bestIndex = 0;
  for (let i = 1, bestVal = selector(array[0]); i < array.length; i++) {
    const x = selector(array[i]);
    if (!(x < bestVal)) {
      continue;
    }
    bestIndex = i;
    bestVal = x;
  }
  return array[bestIndex];
}

export function arrayMaxBy<T>(array: T[], selector: (x: T) => number) {
  if (array.length === 0) {
    return;
  }
  let bestIndex = 0;
  for (let i = 1, bestVal = selector(array[0]); i < array.length; i++) {
    const x = selector(array[i]);
    if (!(x > bestVal)) {
      continue;
    }
    bestIndex = i;
    bestVal = x;
  }
  return array[bestIndex];
}

export function arrayGroupBy<T, K>(array: T[], keySelector: (x: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of array) {
    const key = keySelector(item);
    const collection = map.get(key);
    if (collection) {
      collection.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

export function arrayGroupInto<T, K>(array: T[], keySelector: (x: T) => K): { key: K; items: T[] }[];
export function arrayGroupInto<T, K>(
  array: T[] | null | undefined,
  keySelector: (x: T) => K
): { key: K; items: T[] }[] | undefined;
export function arrayGroupInto<T, K>(
  array: T[] | null | undefined,
  keySelector: (x: T) => K
): { key: K; items: T[] }[] | undefined {
  if (array === null || array === undefined) {
    return undefined;
  }
  const map = arrayGroupBy(array, keySelector);
  const ar: {
    key: K;
    items: T[];
  }[] = [];
  for (const [key, items] of map) {
    ar.push({ key, items });
  }
  return ar;
}

export function arrayFilterNull<T>(array: (T | null)[]): T[];
export function arrayFilterNull<T>(array: (T | null)[] | null | undefined): T[] | undefined;
export function arrayFilterNull<T>(array: (T | null)[] | null | undefined): T[] | undefined {
  if (array === null || array === undefined) {
    return undefined;
  }
  return array.filter((x) => x !== null);
}

export function arrayFilterFalsy<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((value): value is T => Boolean(value));
}

export function arrayUpdateWith<T>(
  array: T[],
  newData: T[]
): {
  removed: number;
  added: number;
} {
  if (haveSameArrayItems(array, newData)) {
    return { removed: 0, added: 0 };
  }
  const added = arrayExcept(newData, array);
  const removed = arrayExcept(array, newData);
  arrayRemoveAll(array, (x) => removed.includes(x));
  for (const a of added) {
    array.push(a);
  }
  return { removed: removed.length, added: added.length };
}

export function arrayIsEqual(array: string[], other: string[]): boolean {
  if (array.length === 0 && other.length === 0) {
    return true;
  }
  if (array.length !== other.length) {
    return false;
  }
  for (let i = 0; i < array.length; i++) {
    if (array[i] !== other[i]) {
      return false;
    }
  }
  return true;
}

export function arrayDistinct<T>(array: T[], keySelector?: (x: T) => unknown): T[];
export function arrayDistinct<T>(array: T[] | null | undefined, keySelector?: (x: T) => unknown): T[] | undefined;
export function arrayDistinct<T>(array: T[] | null | undefined, keySelector?: (x: T) => unknown): T[] | undefined {
  if (array === null || array === undefined) {
    return undefined;
  }
  if (!keySelector) {
    return [...new Set(array)];
  }
  return distinctByKey(array, keySelector);
}

function distinctByKey<T>(array: T[], keySelector: (item: T) => unknown): T[] {
  const set = new Set<unknown>();
  const ar: T[] = [];
  for (const item of array) {
    const key = keySelector(item);
    if (set.has(key)) {
      continue;
    }
    set.add(key);
    ar.push(item);
  }
  return ar;
}

export function arrayPushDistinct<T>(array: T[], ...elements: T[]): void {
  if (array.length + elements.length > 50) {
    const s = new Set(array);
    for (const e of elements) {
      if (!s.has(e)) {
        array.push(e);
      }
    }
  } else {
    for (const e of elements) {
      if (!array.includes(e)) {
        array.push(e);
      }
    }
  }
}

export function arrayIntersection<T>(array: T[], other: T[]): T[] {
  const thisSet = new Set<T>(array);
  const results: T[] = [];
  for (const e of other) {
    if (thisSet.has(e)) {
      results.push(e);
    }
  }
  return results;
}

export function arrayExcept<T>(array: T[], other: T[]): T[] {
  const ar: T[] = [];
  const otherSet = new Set<T>(other);
  for (const e of array) {
    if (otherSet.has(e)) {
      continue;
    }
    ar.push(e);
  }
  return ar;
}

export function arrayGenericJoin<T>(array: T[], getSeparator: (last: T, current: T, index: number) => T): T[] {
  const ar: T[] = [];
  for (let i = 1; i < array.length; i++) {
    const last = array[i - 1];
    const current = array[i];
    const separator = getSeparator(last, current, i);
    ar.push(last, separator);
  }
  // add final element
  const lastElement = array.at(-1);
  if (lastElement !== undefined) {
    ar.push(lastElement);
  }
  return ar;
}

export function arrayToMap<TItem, TKey, TValue>(
  array: TItem[],
  computeKey: (item: TItem) => TKey,
  computeValue: (item: TItem) => TValue
): Map<TKey, TValue> {
  const map = new Map<TKey, TValue>();
  for (const item of array) {
    const key = computeKey(item);
    const value = computeValue(item);
    map.set(key, value);
  }
  return map;
}

export function arrayJoinStr(array: (string | null | undefined)[], separator: string): string {
  let r = '';
  for (const str of array) {
    if (str === null || str === undefined || str === '') {
      continue;
    }
    if (r.length === 0) {
      r = str;
    } else {
      r += separator + str;
    }
  }
  return r;
}

export function arrayOrderBy<T>(array: T[], getElementOrder: (item: T) => number): T[] {
  const result = array.slice();
  const elementOrder = new Map<T, number>();
  for (const e of array) {
    elementOrder.set(e, getElementOrder(e));
  }
  result.sort((a, b) => {
    const orderA = elementOrder.get(a);
    if (typeof orderA === 'undefined') {
      return 0;
    }
    const orderB = elementOrder.get(b);
    if (typeof orderB === 'undefined') {
      return 0;
    }
    return orderA - orderB;
  });
  return result;
}

function haveSameArrayItems<T>(current: T[], next: T[]): boolean {
  if (current.length !== next.length) {
    return false;
  }
  for (let index = 0; index < current.length; index++) {
    if (current[index] !== next[index]) {
      return false;
    }
  }
  return true;
}
