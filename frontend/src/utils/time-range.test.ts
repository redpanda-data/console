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

import { getEvenlySpacedTimeTicks } from './time-range';
import { describe, expect, test } from 'bun:test';

describe('getEvenlySpacedTimeTicks', () => {
  test('spans the full window inclusive of both endpoints', () => {
    const ticks = getEvenlySpacedTimeTicks(0, 60_000, 6);
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(60_000);
  });

  test('produces evenly spaced ticks', () => {
    const ticks = getEvenlySpacedTimeTicks(0, 100, 5);
    expect(ticks).toStrictEqual([0, 25, 50, 75, 100]);
  });

  test('falls back to a single tick for degenerate ranges', () => {
    expect(getEvenlySpacedTimeTicks(500, 500)).toStrictEqual([500]);
    expect(getEvenlySpacedTimeTicks(800, 500)).toStrictEqual([800]);
    expect(getEvenlySpacedTimeTicks(0, 100, 1)).toStrictEqual([0]);
  });
});
