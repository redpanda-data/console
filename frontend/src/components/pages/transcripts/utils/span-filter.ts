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

  // Build parentId lookup using hex-encoded span IDs
  const parentMap = new Map<string, string>();
  for (const span of spans) {
    const spanId = bytesToHex(span.spanId);
    const parentSpanId = bytesToHex(span.parentSpanId);
    parentMap.set(spanId, parentSpanId);
  }

  // Collect matched + all ancestors
  const needed = new Set<string>();
  for (const spanId of matchedSpanIds) {
    let current: string | undefined = spanId;
    while (current && !needed.has(current) && current !== '0000000000000000') {
      needed.add(current);
      current = parentMap.get(current);
    }
  }

  return spans.filter((span) => needed.has(bytesToHex(span.spanId)));
}
