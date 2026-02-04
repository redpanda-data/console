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

import { bytesToHex } from './hex-utils';

// OTEL backends vary: some send empty bytes for root spans (handled by falsy check),
// some send 8 null bytes which encode to this hex string
const ZERO_SPAN_ID = '0000000000000000';

/**
 * Filters spans to only include matched spans and their ancestors.
 * Preserves tree context by walking up parent chain from each matched span.
 *
 * @param spans - All spans from the trace
 * @param matchedSpanIds - Set of span IDs that matched the active filters
 * @returns Filtered spans including matched spans and their ancestors
 */
export function filterToMatchedAndAncestors(spans: Span[], matchedSpanIds: Set<string>): Span[] {
  if (matchedSpanIds.size === 0) {
    return spans;
  }

  // Single pass: build both lookups
  const spanMap = new Map<string, Span>();
  const parentMap = new Map<string, string>();

  for (const span of spans) {
    const spanId = bytesToHex(span.spanId);
    spanMap.set(spanId, span);
    const parentSpanId = bytesToHex(span.parentSpanId);
    if (parentSpanId && parentSpanId !== ZERO_SPAN_ID) {
      parentMap.set(spanId, parentSpanId);
    }
  }

  // Collect matched + ancestors
  const resultIds = new Set<string>();
  for (const spanId of matchedSpanIds) {
    let current: string | undefined = spanId;
    while (current && !resultIds.has(current)) {
      resultIds.add(current);
      current = parentMap.get(current);
    }
  }

  // Construct result directly (only iterates visible spans)
  const result: Span[] = [];
  for (const id of resultIds) {
    const span = spanMap.get(id);
    if (span) result.push(span);
  }
  return result;
}
