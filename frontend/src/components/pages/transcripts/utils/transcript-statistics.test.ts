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

import {
  calculateVisibleWindow,
  groupTranscriptsByDate,
  isIncompleteTranscript,
  isRootSpan,
} from './transcript-statistics';

// Helper to create mock TraceSummary objects for testing
const createMockTranscript = (data: { transcriptId: string; startTimeMs?: number }): TraceSummary =>
  ({
    traceId: data.transcriptId,
    startTime: data.startTimeMs
      ? { seconds: BigInt(Math.floor(data.startTimeMs / 1000)), nanos: (data.startTimeMs % 1000) * 1_000_000 }
      : undefined,
    rootSpanName: '',
    rootServiceName: '',
    spanCount: 0,
    errorCount: 0,
  }) as TraceSummary;

describe('isIncompleteTranscript', () => {
  it('returns true for undefined rootSpanName', () => {
    expect(isIncompleteTranscript(undefined)).toBe(true);
  });

  it('returns true for empty rootSpanName', () => {
    expect(isIncompleteTranscript('')).toBe(true);
  });

  it('returns false for non-empty rootSpanName', () => {
    expect(isIncompleteTranscript('my-span')).toBe(false);
    expect(isIncompleteTranscript('root')).toBe(false);
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
  it('returns zeros for empty transcript list', () => {
    expect(calculateVisibleWindow([])).toEqual({ startMs: 0, endMs: 0 });
  });

  it('calculates correct window for single transcript', () => {
    const transcripts = [createMockTranscript({ transcriptId: '1', startTimeMs: 1000 })];
    const result = calculateVisibleWindow(transcripts);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(1000);
  });

  it('calculates correct window for multiple transcripts', () => {
    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: 1000 }),
      createMockTranscript({ transcriptId: '2', startTimeMs: 3000 }),
      createMockTranscript({ transcriptId: '3', startTimeMs: 2000 }),
    ];
    const result = calculateVisibleWindow(transcripts);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(3000);
  });

  it('ignores transcripts without startTime', () => {
    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: 1000 }),
      createMockTranscript({ transcriptId: '2' }), // no startTime
      createMockTranscript({ transcriptId: '3', startTimeMs: 2000 }),
    ];
    const result = calculateVisibleWindow(transcripts);
    expect(result.startMs).toBe(1000);
    expect(result.endMs).toBe(2000);
  });

  it('returns zeros when all transcripts lack startTime', () => {
    const transcripts = [createMockTranscript({ transcriptId: '1' }), createMockTranscript({ transcriptId: '2' })];
    expect(calculateVisibleWindow(transcripts)).toEqual({ startMs: 0, endMs: 0 });
  });
});

describe('groupTranscriptsByDate', () => {
  it('returns empty array for empty transcript list', () => {
    expect(groupTranscriptsByDate([])).toEqual([]);
  });

  it('groups transcripts by date', () => {
    // Jan 15, 2025 10:00 UTC
    const date1 = new Date('2025-01-15T10:00:00Z');
    // Jan 15, 2025 14:00 UTC (same day)
    const date2 = new Date('2025-01-15T14:00:00Z');
    // Jan 16, 2025 10:00 UTC (different day)
    const date3 = new Date('2025-01-16T10:00:00Z');

    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: date1.getTime() }),
      createMockTranscript({ transcriptId: '2', startTimeMs: date2.getTime() }),
      createMockTranscript({ transcriptId: '3', startTimeMs: date3.getTime() }),
    ];

    const result = groupTranscriptsByDate(transcripts);

    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('2025-01-15');
    expect(result[0][1].traces).toHaveLength(2);
    expect(result[1][0]).toBe('2025-01-16');
    expect(result[1][1].traces).toHaveLength(1);
  });

  it('excludes transcripts without startTime', () => {
    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: new Date('2025-01-15T10:00:00Z').getTime() }),
      createMockTranscript({ transcriptId: '2' }), // no startTime
    ];

    const result = groupTranscriptsByDate(transcripts);

    expect(result).toHaveLength(1);
    expect(result[0][1].traces).toHaveLength(1);
    expect(result[0][1].traces[0].traceId).toBe('1');
  });

  it('includes human-readable date labels', () => {
    const transcripts = [
      createMockTranscript({ transcriptId: '1', startTimeMs: new Date('2025-01-15T10:00:00Z').getTime() }),
    ];

    const result = groupTranscriptsByDate(transcripts);

    expect(result[0][1].label).toContain('2025');
    expect(result[0][1].label).toContain('Jan');
    expect(result[0][1].label).toContain('15');
  });
});
