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

import { type Span, Status_StatusCode } from 'protogen/redpanda/otel/v1/trace_pb';

import { extractSpanAttributes } from './attribute-helpers';
import { bytesToHex } from './hex-utils';

export type SpanNode = {
  spanId: string;
  parentSpanId: string;
  name: string;
  startTime: bigint;
  endTime: bigint;
  duration: number;
  hasError: boolean;
  attributes: Map<string, string | number | boolean>;
  children: SpanNode[];
  span: Span;
};

export const buildSpanTree = (spans: Span[]): SpanNode[] => {
  const nodeMap = new Map<string, SpanNode>();

  for (const span of spans) {
    const spanId = bytesToHex(span.spanId);
    const parentSpanId = bytesToHex(span.parentSpanId);
    const duration = Math.max(0, Number((span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000n));

    nodeMap.set(spanId, {
      spanId,
      parentSpanId,
      name: span.name,
      startTime: span.startTimeUnixNano,
      endTime: span.endTimeUnixNano,
      duration,
      hasError: span.status?.code === Status_StatusCode.ERROR,
      attributes: extractSpanAttributes(span.attributes),
      children: [],
      span,
    });
  }

  const roots: SpanNode[] = [];
  for (const node of nodeMap.values()) {
    if (!node.parentSpanId || node.parentSpanId === '0000000000000000') {
      roots.push(node);
    } else {
      const parent = nodeMap.get(node.parentSpanId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  const sortChildren = (node: SpanNode, visiting = new Set<string>()) => {
    if (visiting.has(node.spanId)) {
      return; // Stop on cycle
    }
    visiting.add(node.spanId);
    node.children.sort((a, b) => {
      if (a.startTime < b.startTime) {
        return -1;
      }
      if (a.startTime > b.startTime) {
        return 1;
      }
      return 0;
    });
    for (const child of node.children) {
      sortChildren(child, visiting);
    }
    visiting.delete(node.spanId);
  };
  for (const root of roots) {
    sortChildren(root);
  }

  return roots;
};

export const calculateTimeline = (roots: SpanNode[]) => {
  // Initialize to the first root's timestamps to avoid Number.MAX_SAFE_INTEGER issue
  // (actual nanosecond timestamps are larger than Number.MAX_SAFE_INTEGER)
  let minTime = roots[0]?.startTime ?? BigInt(0);
  let maxTime = roots[0]?.endTime ?? BigInt(0);

  const traverse = (node: SpanNode) => {
    if (node.startTime < minTime) {
      minTime = node.startTime;
    }
    if (node.endTime > maxTime) {
      maxTime = node.endTime;
    }
    node.children.forEach(traverse);
  };

  roots.forEach(traverse);

  return {
    minTime,
    maxTime,
    duration: Number((maxTime - minTime) / 1_000_000n),
  };
};

export const calculateOffset = (startTime: bigint, timeline: ReturnType<typeof calculateTimeline>): number => {
  if (timeline.duration === 0) {
    return 0;
  }
  const offset = Number((startTime - timeline.minTime) / 1_000_000n);
  const percentage = (offset / timeline.duration) * 100;
  // Clamp between 0% and 99% to keep bars visible
  return Math.max(0, Math.min(percentage, 99));
};

export const calculateWidth = (duration: number, timeline: ReturnType<typeof calculateTimeline>): number => {
  if (timeline.duration === 0) {
    return 100;
  }
  const width = (duration / timeline.duration) * 100;
  // Clamp between 0.5% (minimum visible) and 100% (maximum to prevent overflow)
  return Math.max(0.5, Math.min(width, 100));
};
