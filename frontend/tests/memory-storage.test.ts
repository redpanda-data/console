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

import { createMemoryStorage } from './memory-storage';

describe('createMemoryStorage', () => {
  test('implements the Storage contract without retaining values after clear', () => {
    const storage = createMemoryStorage();

    storage.setItem('first', 'one');
    storage.setItem('second', 'two');

    expect(storage.length).toBe(2);
    expect(storage.getItem('first')).toBe('one');
    expect(storage.key(1)).toBe('second');

    storage.removeItem('first');
    expect(storage.getItem('first')).toBeNull();

    storage.clear();
    expect(storage.length).toBe(0);
    expect(storage.key(0)).toBeNull();
  });
});
