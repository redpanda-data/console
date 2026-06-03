import { describe, expect, test } from 'vitest';

import {
  addSeriesToMap,
  formatChartTimestamp,
  formatTooltipLabel,
  insertGapMarkers,
  type MergedPoint,
  mergeTimeSeries,
  type TimeSeriesResult,
} from './pipeline-throughput.utils';

describe('addSeriesToMap', () => {
  test('adds ingress data points to an empty map', () => {
    const map = new Map<number, MergedPoint>();
    const results: TimeSeriesResult[] = [{ values: [{ timestamp: { seconds: 1000n }, value: 42 }] }];
    addSeriesToMap(map, results, 'ingress');
    expect(map.get(1_000_000)).toEqual({ timestamp: 1_000_000, ingress: 42, egress: 0 });
  });

  test('merges into existing entry for the same timestamp', () => {
    const map = new Map<number, MergedPoint>();
    map.set(1_000_000, { timestamp: 1_000_000, ingress: 10, egress: 0 });
    const results: TimeSeriesResult[] = [{ values: [{ timestamp: { seconds: 1000n }, value: 5 }] }];
    addSeriesToMap(map, results, 'egress');
    expect(map.get(1_000_000)).toEqual({ timestamp: 1_000_000, ingress: 10, egress: 5 });
  });

  test('skips points without timestamp', () => {
    const map = new Map<number, MergedPoint>();
    const results: TimeSeriesResult[] = [{ values: [{ value: 42 }] }];
    addSeriesToMap(map, results, 'ingress');
    expect(map.size).toBe(0);
  });

  test('skips points without value', () => {
    const map = new Map<number, MergedPoint>();
    const results: TimeSeriesResult[] = [{ values: [{ timestamp: { seconds: 1000n } }] }];
    addSeriesToMap(map, results, 'ingress');
    expect(map.size).toBe(0);
  });

  test('handles value of 0', () => {
    const map = new Map<number, MergedPoint>();
    const results: TimeSeriesResult[] = [{ values: [{ timestamp: { seconds: 1000n }, value: 0 }] }];
    addSeriesToMap(map, results, 'ingress');
    expect(map.get(1_000_000)).toEqual({ timestamp: 1_000_000, ingress: 0, egress: 0 });
  });

  test('processes multiple series and points', () => {
    const map = new Map<number, MergedPoint>();
    const results: TimeSeriesResult[] = [
      {
        values: [
          { timestamp: { seconds: 100n }, value: 1 },
          { timestamp: { seconds: 200n }, value: 2 },
        ],
      },
      { values: [{ timestamp: { seconds: 300n }, value: 3 }] },
    ];
    addSeriesToMap(map, results, 'ingress');
    expect(map.size).toBe(3);
    expect(map.get(100_000)?.ingress).toBe(1);
    expect(map.get(200_000)?.ingress).toBe(2);
    expect(map.get(300_000)?.ingress).toBe(3);
  });
});

describe('mergeTimeSeries', () => {
  test('returns empty array for empty inputs', () => {
    expect(mergeTimeSeries([], [])).toEqual([]);
  });

  test('merges ingress and egress at matching timestamps', () => {
    const ingress: TimeSeriesResult[] = [{ values: [{ timestamp: { seconds: 100n }, value: 10 }] }];
    const egress: TimeSeriesResult[] = [{ values: [{ timestamp: { seconds: 100n }, value: 20 }] }];
    expect(mergeTimeSeries(ingress, egress)).toEqual([{ timestamp: 100_000, ingress: 10, egress: 20 }]);
  });

  test('sorts results by timestamp', () => {
    const ingress: TimeSeriesResult[] = [
      {
        values: [
          { timestamp: { seconds: 300n }, value: 3 },
          { timestamp: { seconds: 100n }, value: 1 },
        ],
      },
    ];
    const result = mergeTimeSeries(ingress, []);
    expect(result[0].timestamp).toBe(100_000);
    expect(result[1].timestamp).toBe(300_000);
  });

  test('fills missing series with 0', () => {
    const ingress: TimeSeriesResult[] = [{ values: [{ timestamp: { seconds: 100n }, value: 10 }] }];
    const result = mergeTimeSeries(ingress, []);
    expect(result).toEqual([{ timestamp: 100_000, ingress: 10, egress: 0 }]);
  });
});

describe('insertGapMarkers', () => {
  const pt = (timestamp: number, ingress: number): MergedPoint => ({ timestamp, ingress, egress: ingress });

  test('leaves evenly spaced points untouched', () => {
    const points = [pt(0, 1), pt(60, 2), pt(120, 3)];
    expect(insertGapMarkers(points)).toEqual(points);
  });

  test('inserts a null marker inside a larger-than-step gap', () => {
    // Regular 60s step, then a jump of 600s (service was down).
    const points = [pt(0, 1), pt(60, 2), pt(660, 3)];
    const result = insertGapMarkers(points);
    expect(result).toEqual([pt(0, 1), pt(60, 2), { timestamp: 120, ingress: null, egress: null }, pt(660, 3)]);
  });

  test('returns fewer than two points unchanged', () => {
    expect(insertGapMarkers([])).toEqual([]);
    expect(insertGapMarkers([pt(0, 1)])).toEqual([pt(0, 1)]);
  });

  test('mergeTimeSeries breaks the line across a no-data gap', () => {
    const ingress: TimeSeriesResult[] = [
      {
        values: [
          { timestamp: { seconds: 0n }, value: 1 },
          { timestamp: { seconds: 60n }, value: 2 },
          { timestamp: { seconds: 660n }, value: 3 },
        ],
      },
    ];
    const result = mergeTimeSeries(ingress, []);
    expect(result.some((p) => p.ingress === null)).toBe(true);
  });
});

describe('formatChartTimestamp', () => {
  test('formats millisecond timestamp to time string', () => {
    const result = formatChartTimestamp(new Date('2026-01-15T14:30:00Z').getTime());
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('formatTooltipLabel', () => {
  test('formats timestamp with month, day, and time', () => {
    const result = formatTooltipLabel(new Date('2026-03-15T14:30:00Z').getTime());
    expect(result).toContain('Mar');
    expect(result).toContain('15');
  });
});
