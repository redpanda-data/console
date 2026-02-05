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

export type TimeRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h';

export type TimeRangeConfig = {
  value: TimeRange;
  label: string;
  ms: number;
};

export type TimeRangeDates = {
  start: Date;
  end: Date;
};

const ALL_TIME_RANGES: TimeRangeConfig[] = [
  { value: '5m', label: 'Last 5 minutes', ms: 5 * 60 * 1000 },
  { value: '15m', label: 'Last 15 minutes', ms: 15 * 60 * 1000 },
  { value: '30m', label: 'Last 30 minutes', ms: 30 * 60 * 1000 },
  { value: '1h', label: 'Last 1 hour', ms: 60 * 60 * 1000 },
  { value: '3h', label: 'Last 3 hours', ms: 3 * 60 * 60 * 1000 },
  { value: '6h', label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000 },
  { value: '12h', label: 'Last 12 hours', ms: 12 * 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
];

export function getTimeRanges(maxMs: number): TimeRangeConfig[] {
  return ALL_TIME_RANGES.filter((range) => range.ms <= maxMs);
}

export function calculateTimeRange(selectedTimeRange: TimeRange): TimeRangeDates {
  const now = new Date();
  const config = ALL_TIME_RANGES.find((range) => range.value === selectedTimeRange);
  if (!config) {
    throw new Error(`Invalid time range: ${selectedTimeRange}`);
  }
  const startTime = new Date(now.getTime() - config.ms);

  return {
    start: startTime,
    end: now,
  };
}
