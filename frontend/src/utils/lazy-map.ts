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

export class LazyMap<K, V> extends Map<K, V> {
  private readonly defaultCreate: (key: K) => V;
  private readonly maxSize?: number;

  /**
   * @param defaultCreate factory for missing values.
   * @param maxSize when set, the map behaves as a bounded LRU cache: accessing a key marks it
   *   most-recently-used and inserting beyond `maxSize` evicts the least-recently-used entry.
   *   Unbounded when omitted (original behaviour).
   */
  constructor(defaultCreate: (key: K) => V, maxSize?: number) {
    super();
    this.defaultCreate = defaultCreate;
    this.maxSize = maxSize;
  }

  /**
   * @description Returns the value corrosponding to key
   * @param key Key of the value
   * @param create An optional `create` method to use instead of `defaultCreate` to create missing values
   */
  get(key: K, createFn?: (k: K) => V): V {
    const existing = super.get(key);
    if (existing !== undefined) {
      if (this.maxSize !== undefined) {
        // Mark as most-recently-used so it survives eviction.
        super.delete(key);
        super.set(key, existing);
      }
      return existing;
    }

    const created = this.handleMiss(key, createFn);
    this.set(key, created);
    this.evictOldest();
    return created;
  }

  private evictOldest(): void {
    if (this.maxSize === undefined) {
      return;
    }
    while (this.size > this.maxSize) {
      const oldestKey = this.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.delete(oldestKey);
    }
  }

  private handleMiss(key: K, createFn?: (k: K) => V): V {
    if (createFn) {
      return createFn(key);
    }
    return this.defaultCreate(key);
  }
}
