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

export type TimeSeriesResult = { values: { timestamp?: { seconds: bigint }; value?: number }[]; name?: string };
export type MergedPoint = { timestamp: number; ingress: number; egress: number };

export function addSeriesToMap(
  map: Map<number, MergedPoint>,
  results: TimeSeriesResult[],
  key: 'ingress' | 'egress'
): void {
  for (const series of results) {
    for (const point of series.values) {
      if (!point.timestamp || point.value === undefined) {
        continue;
      }
      const ts = Number(point.timestamp.seconds) * 1000;
      const entry = map.get(ts) ?? { timestamp: ts, ingress: 0, egress: 0 };
      entry[key] = point.value;
      map.set(ts, entry);
    }
  }
}

export function mergeTimeSeries(ingressResults: TimeSeriesResult[], egressResults: TimeSeriesResult[]): MergedPoint[] {
  const map = new Map<number, MergedPoint>();
  addSeriesToMap(map, ingressResults, 'ingress');
  addSeriesToMap(map, egressResults, 'egress');
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function formatChartTimestamp(value: number): string {
  return new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function formatTooltipLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
