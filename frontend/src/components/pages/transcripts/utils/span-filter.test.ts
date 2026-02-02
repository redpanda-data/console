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

import { filterToMatchedAndAncestors } from './span-filter';

// Helper to create mock spans with specific IDs
const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
};

const createMockSpan = (spanId: string, parentSpanId: string, name: string) => ({
  $typeName: 'redpanda.otel.v1.Span' as const,
  spanId: hexToBytes(spanId),
  parentSpanId: hexToBytes(parentSpanId),
  name,
  traceId: hexToBytes('00000000000000000000000000000001'),
  startTimeUnixNano: BigInt(0),
  endTimeUnixNano: BigInt(1000000),
  resource: undefined,
  resourceSchemaUrl: '',
  scope: undefined,
  scopeSchemaUrl: '',
  traceState: '',
  flags: 0,
  kind: 0,
  attributes: [],
  droppedAttributesCount: 0,
  events: [],
  droppedEventsCount: 0,
  links: [],
  droppedLinksCount: 0,
  status: undefined,
});

describe('filterToMatchedAndAncestors', () => {
  it('returns all spans when matchedSpanIds is empty', () => {
    const spans = [
      createMockSpan('0000000000000001', '0000000000000000', 'root'),
      createMockSpan('0000000000000002', '0000000000000001', 'child1'),
      createMockSpan('0000000000000003', '0000000000000001', 'child2'),
    ];

    const result = filterToMatchedAndAncestors(spans, new Set());
    expect(result).toHaveLength(3);
  });

  it('returns only matched span when it is the root', () => {
    const spans = [
      createMockSpan('0000000000000001', '0000000000000000', 'root'),
      createMockSpan('0000000000000002', '0000000000000001', 'child1'),
      createMockSpan('0000000000000003', '0000000000000001', 'child2'),
    ];

    const result = filterToMatchedAndAncestors(spans, new Set(['0000000000000001']));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('root');
  });

  it('returns matched span and all ancestors', () => {
    const spans = [
      createMockSpan('0000000000000001', '0000000000000000', 'root'),
      createMockSpan('0000000000000002', '0000000000000001', 'child'),
      createMockSpan('0000000000000003', '0000000000000002', 'grandchild'),
    ];

    // Match the grandchild - should include grandchild, child, and root
    const result = filterToMatchedAndAncestors(spans, new Set(['0000000000000003']));
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.name).sort()).toEqual(['child', 'grandchild', 'root']);
  });

  it('excludes sibling spans that are not matched', () => {
    const spans = [
      createMockSpan('0000000000000001', '0000000000000000', 'root'),
      createMockSpan('0000000000000002', '0000000000000001', 'child1'),
      createMockSpan('0000000000000003', '0000000000000001', 'child2'),
      createMockSpan('0000000000000004', '0000000000000002', 'grandchild1'),
    ];

    // Match grandchild1 - should include grandchild1, child1, root but NOT child2
    const result = filterToMatchedAndAncestors(spans, new Set(['0000000000000004']));
    expect(result).toHaveLength(3);
    expect(result.map((s) => s.name).sort()).toEqual(['child1', 'grandchild1', 'root']);
  });

  it('handles multiple matched spans and merges their ancestor chains', () => {
    const spans = [
      createMockSpan('0000000000000001', '0000000000000000', 'root'),
      createMockSpan('0000000000000002', '0000000000000001', 'child1'),
      createMockSpan('0000000000000003', '0000000000000001', 'child2'),
      createMockSpan('0000000000000004', '0000000000000002', 'grandchild1'),
      createMockSpan('0000000000000005', '0000000000000003', 'grandchild2'),
    ];

    // Match both grandchildren - should include both branches + root
    const result = filterToMatchedAndAncestors(
      spans,
      new Set(['0000000000000004', '0000000000000005'])
    );
    expect(result).toHaveLength(5);
  });

  it('handles spans with missing parents gracefully', () => {
    const spans = [
      createMockSpan('0000000000000002', '0000000000000001', 'orphan'), // parent doesn't exist
      createMockSpan('0000000000000003', '0000000000000002', 'child'),
    ];

    const result = filterToMatchedAndAncestors(spans, new Set(['0000000000000003']));
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name).sort()).toEqual(['child', 'orphan']);
  });
});
