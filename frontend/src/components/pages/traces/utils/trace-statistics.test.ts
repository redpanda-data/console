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

import type { TraceSummary } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import { describe, expect, it } from 'vitest';

import { calculateVisibleWindow, groupTracesByDate, isIncompleteTrace, isRootSpan } from './trace-statistics';

// Helper to create mock TraceSummary objects for testing
const createMockTrace = (data: { traceId: string; startTimeMs?: number }): TraceSummary =>
  ({
    traceId: data.traceId,
    startTime: data.startTimeMs
      ? { seconds: BigInt(Math.floor(data.startTimeMs / 1000)), nanos: (data.startTimeMs % 1000) * 1_000_000 }
      : undefined,
    rootSpanName: '',
    rootServiceName: '',
    spanCount: 0,
    errorCount: 0,
  }) as TraceSummary;

describe('isIncompleteTrace', () => {
  it('returns true for undefined rootSpanName', () => {
    expect(isIncompleteTrace(undefined)).toBe(true);
  });

  it('returns true for empty rootSpanName', () => {
    expect(isIncompleteTrace('')).toBe(true);
  });

  it('returns false for non-empty rootSpanName', () => {
    expect(isIncompleteTrace('my-span')).toBe(false);
    expect(isIncompleteTrace('root')).toBe(false);
  });
});

describe('isRootSpan', () => {
  it('returns false for undefined span', () => {
    expect(isRootSpan(undefined)).toBe(false);
  });

  it('returns true when parentSpanId is undefined', () => {
    expect(isRootSpan({ parentSpanId: undefined } as never)).toBe(true);
  });

  it('returns true when parentSpanId is empty array', () => {
    expect(isRootSpan({ parentSpanId: new Uint8Array([]) } as never)).toBe(true);
  });

  it('returns true when parentSpanId is all zeros', () => {
    expect(isRootSpan({ parentSpanId: new Uint8Array([0, 0, 0, 0]) } as never)).toBe(true);
  });

  it('returns false when parentSpanId has non-zero values', () => {
    expect(isRootSpan({ parentSpanId: new Uint8Array([1, 2, 3, 4]) } as never)).toBe(false);
  });
});

describe('calculateVisibleWindow', () => {
  it('returns zeros for empty trace list', () => {
    expect(calculateVisibleWindow([])).toEqual({ startMs: 0, endMs: 0 });
  });

  it('calculates correct window for single trace', () => {
    const traces = [createMockTrace({ traceId: '1', startTimeMs: 1000 })];
    const result = calculateVisibleWindow(traces);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(1000);
  });

  it('calculates correct window for multiple traces', () => {
    const traces = [
      createMockTrace({ traceId: '1', startTimeMs: 1000 }),
      createMockTrace({ traceId: '2', startTimeMs: 3000 }),
      createMockTrace({ traceId: '3', startTimeMs: 2000 }),
    ];
    const result = calculateVisibleWindow(traces);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(3000);
  });

  it('ignores traces without startTime', () => {
    const traces = [
      createMockTrace({ traceId: '1', startTimeMs: 1000 }),
      createMockTrace({ traceId: '2' }), // no startTime
      createMockTrace({ traceId: '3', startTimeMs: 2000 }),
    ];
    const result = calculateVisibleWindow(traces);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(2000);
  });

  it('returns zeros when all traces lack startTime', () => {
    const traces = [createMockTrace({ traceId: '1' }), createMockTrace({ traceId: '2' })];
    expect(calculateVisibleWindow(traces)).toEqual({ startMs: 0, endMs: 0 });
  });
});

describe('groupTracesByDate', () => {
  it('returns empty array for empty trace list', () => {
    expect(groupTracesByDate([])).toEqual([]);
  });

  it('groups traces by date', () => {
    // Jan 15, 2025 10:00 UTC
    const date1 = new Date('2025-01-15T10:00:00Z');
    // Jan 15, 2025 14:00 UTC (same day)
    const date2 = new Date('2025-01-15T14:00:00Z');
    // Jan 16, 2025 10:00 UTC (different day)
    const date3 = new Date('2025-01-16T10:00:00Z');

    const traces = [
      createMockTrace({ traceId: '1', startTimeMs: date1.getTime() }),
      createMockTrace({ traceId: '2', startTimeMs: date2.getTime() }),
      createMockTrace({ traceId: '3', startTimeMs: date3.getTime() }),
    ];

    const result = groupTracesByDate(traces);

    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('2025-01-15');
    expect(result[0][1].traces).toHaveLength(2);
    expect(result[1][0]).toBe('2025-01-16');
    expect(result[1][1].traces).toHaveLength(1);
  });

  it('excludes traces without startTime', () => {
    const traces = [
      createMockTrace({ traceId: '1', startTimeMs: new Date('2025-01-15T10:00:00Z').getTime() }),
      createMockTrace({ traceId: '2' }), // no startTime
    ];

    const result = groupTracesByDate(traces);

    expect(result).toHaveLength(1);
    expect(result[0][1].traces).toHaveLength(1);
    expect(result[0][1].traces[0].traceId).toBe('1');
  });

  it('includes human-readable date labels', () => {
    const traces = [createMockTrace({ traceId: '1', startTimeMs: new Date('2025-01-15T10:00:00Z').getTime() })];

    const result = groupTracesByDate(traces);

    expect(result[0][1].label).toContain('2025');
    expect(result[0][1].label).toContain('Jan');
    expect(result[0][1].label).toContain('15');
  });
});
