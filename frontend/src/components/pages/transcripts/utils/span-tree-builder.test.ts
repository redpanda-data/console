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

import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import { describe, expect, it } from 'vitest';

import { buildSpanTree, calculateOffset, calculateTimeline } from './span-tree-builder';

const createMockSpan = (overrides: Partial<Span> = {}): Span =>
  ({
    spanId: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    parentSpanId: new Uint8Array(8),
    traceId: new Uint8Array(16),
    name: 'test-span',
    startTimeUnixNano: BigInt(1_000_000_000_000_000_000),
    endTimeUnixNano: BigInt(1_000_000_001_000_000_000),
    attributes: [],
    status: undefined,
    ...overrides,
  }) as Span;

describe('buildSpanTree', () => {
  it('calculates duration correctly for millisecond-range spans', () => {
    const span = createMockSpan({
      startTimeUnixNano: BigInt('1768493182727000000'),
      endTimeUnixNano: BigInt('1768493182728000000'),
    });

    const [root] = buildSpanTree([span]);
    expect(root.duration).toBe(1);
  });

  it('calculates duration correctly for sub-millisecond spans', () => {
    const span = createMockSpan({
      startTimeUnixNano: BigInt('1768493182727494026'),
      endTimeUnixNano: BigInt('1768493182727532945'),
    });

    const [root] = buildSpanTree([span]);
    expect(root.duration).toBeCloseTo(0.038_919, 5);
  });

  it('calculates duration correctly for microsecond-range spans', () => {
    const span = createMockSpan({
      startTimeUnixNano: BigInt('1768493182727000000'),
      endTimeUnixNano: BigInt('1768493182727500000'),
    });

    const [root] = buildSpanTree([span]);
    expect(root.duration).toBe(0.5);
  });

  it('handles zero duration spans', () => {
    const span = createMockSpan({
      startTimeUnixNano: BigInt('1768493182727000000'),
      endTimeUnixNano: BigInt('1768493182727000000'),
    });

    const [root] = buildSpanTree([span]);
    expect(root.duration).toBe(0);
  });
});

describe('calculateTimeline', () => {
  it('calculates timeline duration for sub-millisecond spans', () => {
    const span = createMockSpan({
      startTimeUnixNano: BigInt('1768493182727494026'),
      endTimeUnixNano: BigInt('1768493182727532945'),
    });

    const [root] = buildSpanTree([span]);
    const timeline = calculateTimeline([root]);

    expect(timeline.duration).toBeCloseTo(0.038_919, 5);
  });
});

describe('calculateOffset', () => {
  it('calculates offset correctly for sub-millisecond differences', () => {
    const span = createMockSpan({
      startTimeUnixNano: BigInt('1768493182727494026'),
      endTimeUnixNano: BigInt('1768493182727532945'),
    });

    const [root] = buildSpanTree([span]);
    const timeline = calculateTimeline([root]);

    const offset = calculateOffset(BigInt('1768493182727514026'), timeline);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(100);
  });
});
