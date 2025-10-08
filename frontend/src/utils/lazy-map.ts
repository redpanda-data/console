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
  private defaultCreate: (key: K) => V;

  constructor(defaultCreate: (key: K) => V) {
    super();
    this.defaultCreate = defaultCreate;
  }

  /**
   * @description Returns the value corrosponding to key
   * @param key Key of the value
   * @param create An optional `create` method to use instead of `defaultCreate` to create missing values
   */
  get(key: K, createFn?: (k: K) => V): V {
    let v = super.get(key);
    if (v !== undefined) {
      return v;
    }

    v = this.handleMiss(key, createFn);
    this.set(key, v);
    return v;
  }

  private handleMiss(key: K, createFn?: (k: K) => V): V {
    if (createFn) {
      return createFn(key);
    }
    return this.defaultCreate(key);
  }
}
