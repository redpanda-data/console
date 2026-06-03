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

import { describe, expect, it } from 'vitest';

import { getEvenlySpacedTimeTicks } from './time-range';

describe('getEvenlySpacedTimeTicks', () => {
  it('spans the full window inclusive of both endpoints', () => {
    const ticks = getEvenlySpacedTimeTicks(0, 60_000, 6);
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(60_000);
  });

  it('produces evenly spaced ticks', () => {
    const ticks = getEvenlySpacedTimeTicks(0, 100, 5);
    expect(ticks).toEqual([0, 25, 50, 75, 100]);
  });

  it('falls back to a single tick for degenerate ranges', () => {
    expect(getEvenlySpacedTimeTicks(500, 500)).toEqual([500]);
    expect(getEvenlySpacedTimeTicks(800, 500)).toEqual([800]);
    expect(getEvenlySpacedTimeTicks(0, 100, 1)).toEqual([0]);
  });
});
