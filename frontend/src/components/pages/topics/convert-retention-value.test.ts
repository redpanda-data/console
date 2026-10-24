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

import { convertRetentionValue } from './convert-retention-value';
import { describe, expect, test } from 'bun:test';

const factors = {
  default: -1,
  infinite: Number.POSITIVE_INFINITY,
  ms: 1,
  seconds: 1000,
  minutes: 60_000,
} as const;

describe('convertRetentionValue', () => {
  test('keeps the amount when switching between concrete units', () => {
    expect(convertRetentionValue(2, 'minutes', 'seconds', factors)).toBe(120);
    expect(convertRetentionValue(90, 'seconds', 'minutes', factors)).toBe(1.5);
  });

  test('treats a default unit as a base amount when leaving it', () => {
    expect(convertRetentionValue(5000, 'default', 'seconds', factors)).toBe(5);
  });

  test('multiplies by the old factor when switching to default', () => {
    expect(convertRetentionValue(3, 'seconds', 'default', factors)).toBe(3000);
  });

  test('rounds values with more than three decimals', () => {
    expect(convertRetentionValue(1, 'seconds', 'minutes', factors)).toBe(0);
    expect(convertRetentionValue(1, 'ms', 'seconds', factors)).toBe(0.001);
  });

  test('falls back to zero when the conversion is not a number', () => {
    expect(convertRetentionValue(0, 'infinite', 'infinite', factors)).toBe(0);
  });
});
