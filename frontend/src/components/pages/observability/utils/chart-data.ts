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

import type { ExecuteRangeQueryResponse } from 'protogen/redpanda/api/dataplane/v1alpha3/observability_pb';

export const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
] as const;

// Helper to add data point to timestamp map
function addDataPoint(
  timestampMap: Map<number, { timestamp: number; [key: string]: number }>,
  seriesName: string,
  point: { timestamp?: { seconds: bigint }; value?: number }
): void {
  if (!point.timestamp || point.value === undefined) {
    return;
  }

  // Convert seconds to milliseconds for JavaScript Date
  const ts = Number(point.timestamp.seconds) * 1000;

  if (!timestampMap.has(ts)) {
    timestampMap.set(ts, { timestamp: ts });
  }

  const entry = timestampMap.get(ts);
  if (entry) {
    entry[seriesName] = point.value;
  }
}

// Helper function to transform time series data into chart format
export function transformTimeSeriesData(results: ExecuteRangeQueryResponse['results']): Array<{
  timestamp: number;
  [key: string]: number;
}> {
  if (!results || results.length === 0) {
    return [];
  }

  const timestampMap = new Map<number, { timestamp: number; [key: string]: number }>();

  for (const series of results) {
    const seriesName = series.name || 'value';
    for (const point of series.values) {
      addDataPoint(timestampMap, seriesName, point);
    }
  }

  return Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}
