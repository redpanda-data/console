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

import { extractSpanAttributes } from './attribute-helpers';

export interface LLMInteraction {
  model: string;
  provider: string;
  input: string;
  output: string;
  inputTokens: number;
  outputTokens: number;
  spanName: string;
}

export const extractLLMData = (trace: Trace | undefined): LLMInteraction[] => {
  if (!trace?.spans) {
    return [];
  }

  // Single pass: build attribute map once per span
  const llmInteractions: LLMInteraction[] = [];

  for (const span of trace.spans) {
    const attrs = extractSpanAttributes(span.attributes);

    // Check if this is an LLM span
    if (attrs.has('gen_ai.system') || attrs.has('gen_ai.request.model')) {
      llmInteractions.push({
        model: String(attrs.get('gen_ai.request.model') || ''),
        provider: String(attrs.get('gen_ai.system') || ''),
        input: String(attrs.get('gen_ai.prompt') || ''),
        output: String(attrs.get('gen_ai.completion') || ''),
        inputTokens: Number(attrs.get('gen_ai.usage.input_tokens') || 0),
        outputTokens: Number(attrs.get('gen_ai.usage.output_tokens') || 0),
        spanName: span.name,
      });
    }
  }

  return llmInteractions;
};

export interface Message {
  role: string;
  content: string;
  timestamp: bigint;
}

export const extractConversationHistory = (trace: Trace | undefined): Message[] => {
  if (!trace?.spans) {
    return [];
  }

  const messages: Message[] = [];

  for (const span of trace.spans) {
    const attrs = extractSpanAttributes(span.attributes);
    if (attrs.has('gen_ai.message.role')) {
      messages.push({
        role: String(attrs.get('gen_ai.message.role')),
        content: String(attrs.get('gen_ai.message.content') || ''),
        timestamp: span.startTimeUnixNano,
      });
    }
  }

  // Sort by timestamp (BigInt comparison)
  return messages.sort((a, b) => {
    if (a.timestamp < b.timestamp) {
      return -1;
    }
    if (a.timestamp > b.timestamp) {
      return 1;
    }
    return 0;
  });
};
