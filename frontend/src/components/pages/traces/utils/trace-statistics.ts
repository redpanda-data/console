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

import type { Trace } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';

import { getAttributeFromSpan, hasAttribute } from './attribute-helpers';

export interface TraceStatistics {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  llmCallCount: number;
  toolCallCount: number;
}

export const calculateTraceStatistics = (trace: Trace | undefined): TraceStatistics => {
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
      llmCallCount++;
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
      toolCallCount++;
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

export const isIncompleteTrace = (rootSpanName: string | undefined): boolean => !rootSpanName || rootSpanName === '';

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
