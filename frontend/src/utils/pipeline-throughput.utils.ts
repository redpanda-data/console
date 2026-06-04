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
// Values are nullable: a null marks a no-data gap so the chart breaks the line
// there instead of drawing across it (see insertGapMarkers).
export type MergedPoint = { timestamp: number; ingress: number | null; egress: number | null };

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

// Smallest spacing between points — the step for a fixed-step range query.
function inferStepMs(points: MergedPoint[]): number | null {
  if (points.length < 2) {
    return null;
  }
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].timestamp - points[i - 1].timestamp;
    if (delta > 0 && delta < min) {
      min = delta;
    }
  }
  return Number.isFinite(min) ? min : null;
}

/**
 * Insert a null marker into any larger-than-step gap so the chart breaks the line
 * there (recharts splits at nulls) instead of drawing across a no-data stretch.
 */
export function insertGapMarkers(points: MergedPoint[]): MergedPoint[] {
  const step = inferStepMs(points);
  if (step === null) {
    return points;
  }
  const maxGap = step * 1.5;
  const result: MergedPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    result.push(points[i]);
    const next = points[i + 1];
    if (next && next.timestamp - points[i].timestamp > maxGap) {
      result.push({ timestamp: points[i].timestamp + step, ingress: null, egress: null });
    }
  }
  return result;
}

export function mergeTimeSeries(ingressResults: TimeSeriesResult[], egressResults: TimeSeriesResult[]): MergedPoint[] {
  const map = new Map<number, MergedPoint>();
  addSeriesToMap(map, ingressResults, 'ingress');
  addSeriesToMap(map, egressResults, 'egress');
  const sorted = [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
  return insertGapMarkers(sorted);
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
