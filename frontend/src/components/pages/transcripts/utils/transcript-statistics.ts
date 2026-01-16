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

import { timestampDate } from '@bufbuild/protobuf/wkt';
import type { Trace, TraceSummary } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';

import { getAttributeFromSpan, hasAttribute } from './attribute-helpers';

export type TranscriptStatistics = {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  llmCallCount: number;
  toolCallCount: number;
};

export const calculateTranscriptStatistics = (trace: Trace | undefined): TranscriptStatistics => {
  if (!trace?.spans) {
    return {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      llmCallCount: 0,
      toolCallCount: 0,
    };
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let llmCallCount = 0;
  let toolCallCount = 0;

  for (const span of trace.spans) {
    const isLLMSpan =
      hasAttribute(span, 'gen_ai.request.model') ||
      hasAttribute(span, 'gen_ai.system') ||
      hasAttribute(span, 'gen_ai.prompt') ||
      hasAttribute(span, 'gen_ai.completion');

    const isToolSpan =
      hasAttribute(span, 'gen_ai.tool.name') ||
      hasAttribute(span, 'gen_ai.tool.call.id') ||
      hasAttribute(span, 'gen_ai.tool.call.arguments');

    if (isLLMSpan) {
      llmCallCount += 1;
      const inputTokens = getAttributeFromSpan(span, 'gen_ai.usage.input_tokens');
      const outputTokens = getAttributeFromSpan(span, 'gen_ai.usage.output_tokens');

      if (typeof inputTokens === 'number') {
        totalInputTokens += inputTokens;
      }
      if (typeof outputTokens === 'number') {
        totalOutputTokens += outputTokens;
      }
    }

    if (isToolSpan) {
      toolCallCount += 1;
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    llmCallCount,
    toolCallCount,
  };
};

export const isRootSpan = (span: Span | undefined): boolean => {
  if (!span) {
    return false;
  }
  return !span.parentSpanId || span.parentSpanId.length === 0 || span.parentSpanId.every((b) => b === 0);
};

export const isIncompleteTranscript = (rootSpanName: string | undefined): boolean =>
  !rootSpanName || rootSpanName === '';

export const getConversationId = (trace: Trace | undefined): string | undefined => {
  if (!trace?.spans) {
    return;
  }

  // Look for conversation ID in any span's attributes
  for (const span of trace.spans) {
    const conversationId = getAttributeFromSpan(span, 'gen_ai.conversation.id');
    if (conversationId && typeof conversationId === 'string') {
      return conversationId;
    }
  }

  return;
};

export type TranscriptDateGroup = {
  label: string;
  traces: TraceSummary[];
};

/**
 * Groups transcripts by date (YYYY-MM-DD) and returns an array of [dateKey, group] tuples.
 * Transcripts without a startTime are excluded.
 */
export const groupTranscriptsByDate = (transcripts: TraceSummary[]): [string, TranscriptDateGroup][] => {
  const grouped = new Map<string, TranscriptDateGroup>();

  for (const trace of transcripts) {
    if (!trace.startTime) {
      continue;
    }

    const date = new Date(Number(trace.startTime.seconds) * 1000);
    const dateKey = date.toISOString().split('T')[0];
    const dateLabel = date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, { label: dateLabel, traces: [] });
    }
    grouped.get(dateKey)?.traces.push(trace);
  }

  return Array.from(grouped.entries());
};

export type VisibleWindow = {
  startMs: number;
  endMs: number;
};

/**
 * Calculate the oldest and newest timestamp from a list of traces.
 * Returns { startMs: 0, endMs: 0 } if the list is empty.
 */
export const calculateVisibleWindow = (traces: TraceSummary[]): VisibleWindow => {
  if (traces.length === 0) {
    return { startMs: 0, endMs: 0 };
  }

  let oldestMs = Number.POSITIVE_INFINITY;
  let newestMs = Number.NEGATIVE_INFINITY;

  for (const trace of traces) {
    if (trace.startTime) {
      const traceMs = timestampDate(trace.startTime).getTime();
      oldestMs = Math.min(oldestMs, traceMs);
      newestMs = Math.max(newestMs, traceMs);
    }
  }

  return {
    startMs: oldestMs === Number.POSITIVE_INFINITY ? 0 : oldestMs,
    endMs: newestMs === Number.NEGATIVE_INFINITY ? 0 : newestMs,
  };
};
