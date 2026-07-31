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
});
