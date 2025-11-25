/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useMemo } from 'react';
import type { ChatMessage, UsageMetadata } from '../types';

/**
 * Hook to calculate cumulative token usage from messages
 * Returns the latest request's usage metadata combined with cumulative totals
 */
export function useCumulativeUsage(messages: ChatMessage[]): UsageMetadata {
  return useMemo(() => {
    let latestRequestUsage: UsageMetadata | undefined;
    let cumulativeInputTokens = 0;
    let cumulativeOutputTokens = 0;
    let cumulativeReasoningTokens = 0;
    let cumulativeCachedTokens = 0;

    for (const message of messages) {
      if (message.usage) {
        // Keep the latest request's usage for context window data
        latestRequestUsage = message.usage;

        // Accumulate token counts
        cumulativeInputTokens += message.usage.input_tokens;
        cumulativeOutputTokens += message.usage.output_tokens;
        if (message.usage.reasoning_tokens) {
          cumulativeReasoningTokens += message.usage.reasoning_tokens;
        }
        if (message.usage.cached_tokens) {
          cumulativeCachedTokens += message.usage.cached_tokens;
        }
      }
    }

    if (latestRequestUsage) {
      return {
        ...latestRequestUsage,
        // Override with cumulative totals for the usage breakdown
        cumulativeInputTokens,
        cumulativeOutputTokens,
        cumulativeReasoningTokens,
        cumulativeCachedTokens,
      };
    }

    // Return default empty usage when no messages exist yet
    return {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cumulativeInputTokens: 0,
      cumulativeOutputTokens: 0,
      cumulativeReasoningTokens: 0,
      cumulativeCachedTokens: 0,
    };
  }, [messages]);
}
