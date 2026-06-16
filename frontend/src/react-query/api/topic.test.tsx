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

import { createRouterTransport } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import { TopicService } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { connectQueryWrapper } from 'test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useListTopicsQuery } from './topic';

// Disable retries so a failing query settles into the error state immediately.
const NO_RETRY = { defaultOptions: { queries: { retry: false } } };

const topicsTransport = (
  topics: Array<{ name: string; internal?: boolean; partitionCount?: number; replicationFactor?: number }>
) =>
  createRouterTransport(({ service }) => {
    service(TopicService, {
      listTopics: () => ({ topics, nextPageToken: '' }),
    });
  });

describe('useListTopicsQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns topics from the gRPC ListTopics endpoint', async () => {
    const { wrapper } = connectQueryWrapper(NO_RETRY, topicsTransport([{ name: 'orders', internal: false }]));
    const { result } = renderHook(() => useListTopicsQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.topics?.map((t) => t.name)).toEqual(['orders']);
  });

  test('filters out internal topics when hideInternalTopics is set', async () => {
    const { wrapper } = connectQueryWrapper(
      NO_RETRY,
      topicsTransport([
        { name: 'orders', internal: false },
        { name: '_internal', internal: true },
        { name: '_schemas', internal: false },
      ])
    );
    const { result } = renderHook(() => useListTopicsQuery(undefined, undefined, { hideInternalTopics: true }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.topics?.map((t) => t.name)).toEqual(['orders']);
  });
});
