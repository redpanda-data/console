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

import { renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { useContextUsage } from './use-context-usage';
import type { UsageMetadata } from '../types';

const makeUsage = (overrides: Partial<UsageMetadata> = {}): UsageMetadata => ({
  cumulativeInputTokens: 0,
  cumulativeOutputTokens: 0,
  cumulativeReasoningTokens: 0,
  cumulativeCachedTokens: 0,
  ...overrides,
});

describe('useContextUsage', () => {
  test('maps cumulative counts onto legacy top-level fields', () => {
    const { result } = renderHook(() =>
      useContextUsage(
        makeUsage({
          cumulativeInputTokens: 100,
          cumulativeOutputTokens: 50,
          cumulativeReasoningTokens: 25,
          cumulativeCachedTokens: 10,
        })
      )
    );

    expect(result.current.inputTokens).toBe(100);
    expect(result.current.outputTokens).toBe(50);
    expect(result.current.reasoningTokens).toBe(25);
    expect(result.current.cachedInputTokens).toBe(10);
    expect(result.current.totalTokens).toBe(150);
  });

  test('populates ai v6 inputTokenDetails / outputTokenDetails sub-objects', () => {
    const { result } = renderHook(() =>
      useContextUsage(
        makeUsage({
          cumulativeInputTokens: 80,
          cumulativeOutputTokens: 20,
          cumulativeReasoningTokens: 7,
          cumulativeCachedTokens: 3,
        })
      )
    );

    // AI SDK v6 moved detail breakdowns into nested objects; we populate them
    // so callers reading from the new shape see consistent values.
    expect(result.current.inputTokenDetails).toEqual({
      noCacheTokens: undefined,
      cacheReadTokens: 3,
      cacheWriteTokens: undefined,
    });
    expect(result.current.outputTokenDetails).toEqual({
      textTokens: undefined,
      reasoningTokens: 7,
    });
  });

  test('returns a stable object across renders when inputs do not change', () => {
    const usage = makeUsage({ cumulativeInputTokens: 5 });
    const { result, rerender } = renderHook((u: UsageMetadata) => useContextUsage(u), {
      initialProps: usage,
    });
    const firstResult = result.current;
    rerender(usage);
    expect(result.current).toBe(firstResult);
  });

  test('recomputes when any cumulative token count changes', () => {
    let usage = makeUsage({ cumulativeInputTokens: 5 });
    const { result, rerender } = renderHook((u: UsageMetadata) => useContextUsage(u), {
      initialProps: usage,
    });
    const firstResult = result.current;
    usage = makeUsage({ cumulativeInputTokens: 7 });
    rerender(usage);
    expect(result.current).not.toBe(firstResult);
    expect(result.current.inputTokens).toBe(7);
  });
});
