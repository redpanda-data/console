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

export type TimeRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h';

export type TimeRangeDates = {
  start: Date;
  end: Date;
};

export const TIME_RANGE_MS: Record<TimeRange, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
};

export const TIME_RANGE_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: '5m', label: 'Last 5m' },
  { value: '15m', label: 'Last 15m' },
  { value: '30m', label: 'Last 30m' },
  { value: '1h', label: 'Last 1h' },
  { value: '3h', label: 'Last 3h' },
  { value: '6h', label: 'Last 6h' },
];

export function calculateTimeRange(selectedTimeRange: TimeRange): TimeRangeDates {
  const now = new Date();
  const startTime = new Date(now.getTime() - TIME_RANGE_MS[selectedTimeRange]);

  return {
    start: startTime,
    end: now,
  };
}

export function formatTimeRangeDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });
}
