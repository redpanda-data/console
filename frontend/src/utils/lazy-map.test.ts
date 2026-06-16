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

import { LazyMap } from './lazy-map';

describe('LazyMap', () => {
  test('auto-creates missing values via defaultCreate', () => {
    const map = new LazyMap<string, string>((k) => `v:${k}`);
    expect(map.get('a')).toBe('v:a');
    expect(map.size).toBe(1);
  });

  test('without a max size it never evicts', () => {
    const map = new LazyMap<string, number>(() => 0);
    for (let i = 0; i < 100; i++) {
      map.get(`k${i}`);
    }
    expect(map.size).toBe(100);
  });

  describe('with a max size', () => {
    test('evicts the oldest entry when the cap is exceeded', () => {
      const map = new LazyMap<string, number>(() => 0, 2);
      map.get('a');
      map.get('b');
      map.get('c'); // exceeds cap -> 'a' (oldest) evicted

      expect(map.size).toBe(2);
      expect(map.has('a')).toBe(false);
      expect(map.has('b')).toBe(true);
      expect(map.has('c')).toBe(true);
    });

    test('keeps recently accessed entries (LRU)', () => {
      const map = new LazyMap<string, number>(() => 0, 2);
      map.get('a');
      map.get('b');
      map.get('a'); // access 'a' -> most recently used
      map.get('c'); // evicts the least recently used ('b'), not 'a'

      expect(map.has('a')).toBe(true);
      expect(map.has('b')).toBe(false);
      expect(map.has('c')).toBe(true);
    });
  });
});
