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

import { formatWithUnit } from './unit';

describe('formatWithUnit', () => {
  test('formats bytes with scale', () => {
    expect(formatWithUnit(512, 'bytes')).toBe('512 B');
    expect(formatWithUnit(1024, 'bytes')).toBe('1.0 KB');
    expect(formatWithUnit(1_500_000, 'bytes')).toBe('1.5 MB');
    expect(formatWithUnit(2_000_000_000, 'BYTES')).toBe('2.0 GB');
  });

  test('formats bytes per second', () => {
    expect(formatWithUnit(2048, 'bytes/second')).toBe('2.0 KB/s');
    expect(formatWithUnit(1_500_000, 'B/s')).toBe('1.5 MB/s');
  });

  test('formats time units', () => {
    expect(formatWithUnit(150, 'ms')).toBe('150 ms');
    expect(formatWithUnit(1500, 'milliseconds')).toBe('1.5K ms');
    expect(formatWithUnit(45, 'seconds')).toBe('45.0 s');
  });

  test('formats compound units', () => {
    expect(formatWithUnit(1500, 'requests/second')).toBe('1.5K req/s');
    expect(formatWithUnit(120, 'operations/minute')).toBe('120 ope/min');
  });

  test('abbreviates unknown units to 3 chars', () => {
    expect(formatWithUnit(42, 'widgets')).toBe('42.0 wid');
    expect(formatWithUnit(5, 'kg')).toBe('5.00 kg');
  });

  test('formats numbers without units', () => {
    expect(formatWithUnit(1500, undefined)).toBe('1.5K');
    expect(formatWithUnit(5, undefined)).toBe('5.00');
    expect(formatWithUnit(1_000_000, undefined)).toBe('1.0M');
  });

  test('handles edge cases', () => {
    expect(formatWithUnit(0, 'bytes')).toBe('0.00 B');
    expect(formatWithUnit(-100, 'bytes')).toBe('-100 B');
    expect(formatWithUnit(1024, '  bytes  ')).toBe('1.0 KB');
  });
});
