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

import { formatDuration, formatTime, formatTraceId, getPreview } from './trace-formatters';

describe('formatDuration', () => {
  it('formats sub-millisecond durations as microseconds', () => {
    expect(formatDuration(0.5)).toBe('500μs');
    expect(formatDuration(0.001)).toBe('1μs');
  });

  it('formats millisecond durations', () => {
    expect(formatDuration(1)).toBe('1.00ms');
    expect(formatDuration(999)).toBe('999.00ms');
    expect(formatDuration(250.5)).toBe('250.50ms');
  });

  it('formats second durations', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(59_999)).toBe('60.00s');
    expect(formatDuration(30_000)).toBe('30.00s');
  });

  it('formats minute durations', () => {
    expect(formatDuration(60_000)).toBe('1.0m');
    expect(formatDuration(3_599_999)).toBe('60.0m');
    expect(formatDuration(150_000)).toBe('2.5m');
  });

  it('formats hour durations', () => {
    expect(formatDuration(3_600_000)).toBe('1.0h');
    expect(formatDuration(7_200_000)).toBe('2.0h');
    expect(formatDuration(5_400_000)).toBe('1.5h');
  });
});

describe('formatTraceId', () => {
  it('returns short IDs unchanged', () => {
    expect(formatTraceId('abc123')).toBe('abc123');
    expect(formatTraceId('123456789012')).toBe('123456789012');
  });

  it('truncates long IDs with ellipsis', () => {
    expect(formatTraceId('1234567890123')).toBe('123456789012...');
    expect(formatTraceId('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijkl...');
  });

  it('respects custom maxLength', () => {
    expect(formatTraceId('1234567890', 5)).toBe('12345...');
    expect(formatTraceId('12345', 5)).toBe('12345');
  });
});

describe('formatTime', () => {
  it('formats time in 24-hour format', () => {
    const date = new Date('2025-01-15T14:30:45Z');
    expect(formatTime(date)).toBe('14:30:45');
  });

  it('pads single digit hours, minutes, seconds', () => {
    const date = new Date('2025-01-15T08:05:03Z');
    expect(formatTime(date)).toBe('08:05:03');
  });

  it('handles noon correctly', () => {
    const date = new Date('2025-01-15T12:00:00Z');
    expect(formatTime(date)).toBe('12:00:00');
  });
});

describe('getPreview', () => {
  it('returns full content if fewer lines than limit', () => {
    expect(getPreview('line1\nline2', 3)).toBe('line1\nline2');
    expect(getPreview('single line', 3)).toBe('single line');
  });

  it('returns full content if exactly at limit', () => {
    expect(getPreview('line1\nline2\nline3', 3)).toBe('line1\nline2\nline3');
  });

  it('truncates content to specified number of lines', () => {
    expect(getPreview('line1\nline2\nline3\nline4', 3)).toBe('line1\nline2\nline3');
    expect(getPreview('a\nb\nc\nd\ne\nf', 2)).toBe('a\nb');
  });

  it('handles empty content', () => {
    expect(getPreview('', 3)).toBe('');
  });

  it('handles single line content', () => {
    expect(getPreview('single', 1)).toBe('single');
  });
});
