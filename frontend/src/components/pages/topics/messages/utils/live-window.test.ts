/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, test } from 'vitest';

import { applyDisplayWindow } from './live-window';

describe('applyDisplayWindow', () => {
  test('returns the same array reference when within the cap', () => {
    const rows = [1, 2, 3];
    const result = applyDisplayWindow(rows, 5);
    expect(result.rows).toBe(rows);
    expect(result.trimmed).toBe(0);
  });

  test('trims the oldest rows (front) and reports the trimmed count', () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    const result = applyDisplayWindow(rows, 4);
    expect(result.rows).toEqual([6, 7, 8, 9]);
    expect(result.trimmed).toBe(6);
  });

  test('handles cap equal to length', () => {
    const rows = [1, 2];
    expect(applyDisplayWindow(rows, 2)).toEqual({ rows, trimmed: 0 });
  });

  test('newestFirst trims the tail instead of the front, keeping the newest rows at the front', () => {
    // Sorted newest-first, as continuous + "Newest" ordering produces before windowing.
    const rows = Array.from({ length: 10 }, (_, i) => 9 - i);
    const result = applyDisplayWindow(rows, 4, { newestFirst: true });
    expect(result.rows).toEqual([9, 8, 7, 6]);
    expect(result.trimmed).toBe(6);
  });

  test('regression: trimming the front of a newest-first array (the pre-fix behavior) would keep the oldest rows instead', () => {
    const rows = Array.from({ length: 10 }, (_, i) => 9 - i);
    const wrongWay = applyDisplayWindow(rows, 4);
    expect(wrongWay.rows).not.toEqual([9, 8, 7, 6]);
    expect(wrongWay.rows).toEqual([3, 2, 1, 0]);
  });
});
