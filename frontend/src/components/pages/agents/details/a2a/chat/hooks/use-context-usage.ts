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

import type { LanguageModelUsage } from 'ai';
import { useMemo } from 'react';

import type { UsageMetadata } from '../types';

/**
 * Hook to transform cumulative usage metadata into context usage format
 * for display in the Context component.
 *
 * Note: ai v6 expanded `LanguageModelUsage` with `inputTokenDetails` and
 * `outputTokenDetails` sub-objects. The legacy top-level `reasoningTokens`
 * and `cachedInputTokens` fields remain (deprecated) for backwards compat and
 * are what the shadcn/ai-elements Context component reads today, but we also
 * populate the new sub-objects so callers that upgrade later get consistent
 * values.
 */
export function useContextUsage(usage: UsageMetadata): LanguageModelUsage {
  return useMemo(
    () => ({
      inputTokens: usage.cumulativeInputTokens,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: usage.cumulativeCachedTokens,
        cacheWriteTokens: undefined,
      },
      outputTokens: usage.cumulativeOutputTokens,
      outputTokenDetails: {
        textTokens: undefined,
        reasoningTokens: usage.cumulativeReasoningTokens,
      },
      totalTokens: usage.cumulativeInputTokens + usage.cumulativeOutputTokens,
      reasoningTokens: usage.cumulativeReasoningTokens,
      cachedInputTokens: usage.cumulativeCachedTokens,
    }),
    [
      usage.cumulativeInputTokens,
      usage.cumulativeOutputTokens,
      usage.cumulativeReasoningTokens,
      usage.cumulativeCachedTokens,
    ]
  );
}
