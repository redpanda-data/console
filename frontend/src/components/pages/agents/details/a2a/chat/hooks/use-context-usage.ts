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
import type { UsageMetadata } from '../types';

/**
 * Hook to transform cumulative usage metadata into context usage format
 * for display in the Context component
 */
export function useContextUsage(usage: UsageMetadata) {
  return useMemo(
    () => ({
      inputTokens: usage.cumulativeInputTokens,
      outputTokens: usage.cumulativeOutputTokens,
      reasoningTokens: usage.cumulativeReasoningTokens,
      cachedInputTokens: usage.cumulativeCachedTokens,
      totalTokens: usage.cumulativeInputTokens + usage.cumulativeOutputTokens,
    }),
    [
      usage.cumulativeInputTokens,
      usage.cumulativeOutputTokens,
      usage.cumulativeReasoningTokens,
      usage.cumulativeCachedTokens,
    ]
  );
}
