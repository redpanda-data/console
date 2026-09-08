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

import { describe, expect, test } from '@rstest/core';

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

  // Regression: continuous + "Newest" orders newest-first, and "Load more" pages sort to the
  // tail. Keeping the head instead (the earlier behavior) pinned the window to the first
  // `cap` rows forever — every fetched page was silently discarded and pagination was stuck.
  test('newest-first ordering: keeps the tail so newly loaded older pages become visible', () => {
    // Sorted newest-first, as continuous + "Newest" ordering produces before windowing.
    const firstThreePages = Array.from({ length: 10 }, (_, i) => 9 - i);
    const withOlderPage = [...firstThreePages, ...Array.from({ length: 4 }, (_, i) => -1 - i)];
    const result = applyDisplayWindow(withOlderPage, 4);
    // The freshly fetched older page is what the window shows — the frontier advanced.
    expect(result.rows).toEqual([-1, -2, -3, -4]);
    expect(result.trimmed).toBe(10);
  });
});
