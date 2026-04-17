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

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { renderHook, waitFor } from '@testing-library/react';
import {
  AIAgentSchema,
  type ListAIAgentsRequest,
  ListAIAgentsRequestSchema,
  ListAIAgentsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { listAIAgents } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { connectQueryWrapper } from 'test-utils';
import { describe, expect, test } from 'vitest';

import { useInfiniteQueryWithAllPages } from './use-infinite-query-with-all-pages';

describe('useInfiniteQueryWithAllPages', () => {
  test('fetches all pages automatically', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, (req) => {
        callCount += 1;
        const pageToken = req.pageToken;

        if (pageToken === '') {
          // First page
          return create(ListAIAgentsResponseSchema, {
            aiAgents: [create(AIAgentSchema, { id: 'agent-1', displayName: 'Agent 1' })],
            nextPageToken: 'page2',
          });
        }
        if (pageToken === 'page2') {
          // Second page
          return create(ListAIAgentsResponseSchema, {
            aiAgents: [create(AIAgentSchema, { id: 'agent-2', displayName: 'Agent 2' })],
            nextPageToken: 'page3',
          });
        }
        // Last page - no nextPageToken
        return create(ListAIAgentsResponseSchema, {
          aiAgents: [create(AIAgentSchema, { id: 'agent-3', displayName: 'Agent 3' })],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const request = create(ListAIAgentsRequestSchema, {
      pageToken: '',
      pageSize: 1,
    }) as ListAIAgentsRequest & Required<Pick<ListAIAgentsRequest, 'pageToken'>>;

    const { result } = renderHook(
      () =>
        useInfiniteQueryWithAllPages(listAIAgents, request, {
          getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
          pageParamKey: 'pageToken',
        }),
      { wrapper }
    );

    // Wait for all pages to be fetched
    await waitFor(
      () => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.hasNextPage).toBe(false);
      },
      { timeout: 5000 }
    );

    // Should have fetched 3 pages
    expect(callCount).toBe(3);
    expect(result.current.data?.pages).toHaveLength(3);
  });

  test('stops fetching on error and does not cause infinite loop', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, (req) => {
        callCount += 1;
        const pageToken = req.pageToken;

        if (pageToken === '') {
          // First page succeeds
          return create(ListAIAgentsResponseSchema, {
            aiAgents: [create(AIAgentSchema, { id: 'agent-1', displayName: 'Agent 1' })],
            nextPageToken: 'page2',
          });
        }
        // Second page fails
        throw new Error('API Error');
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const request = create(ListAIAgentsRequestSchema, {
      pageToken: '',
      pageSize: 1,
    }) as ListAIAgentsRequest & Required<Pick<ListAIAgentsRequest, 'pageToken'>>;

    const { result } = renderHook(
      () =>
        useInfiniteQueryWithAllPages(listAIAgents, request, {
          getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
          pageParamKey: 'pageToken',
        }),
      { wrapper }
    );

    // Wait for the hook to settle on callCount === 2 (first page success + second page error).
    // vi.waitFor polls in small intervals rather than hard-sleeping, so it exits as soon as
    // the condition holds, and stays short enough to catch runaway extra calls.
    await vi.waitFor(
      () => {
        expect(result.current.isFetching).toBe(false);
        expect(callCount).toBe(2);
      },
      { timeout: 2000, interval: 50 }
    );

    // Should have called API exactly twice: first page success, second page error
    // If there's an infinite loop, callCount would be much higher
    expect(callCount).toBe(2);

    // Should have error state
    expect(result.current.isError).toBe(true);

    // Should have first page data
    expect(result.current.data?.pages).toHaveLength(1);
  });

  test('does not fetch when disabled', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, () => {
        callCount += 1;
        return create(ListAIAgentsResponseSchema, {
          aiAgents: [],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const request = create(ListAIAgentsRequestSchema, {
      pageToken: '',
      pageSize: 1,
    }) as ListAIAgentsRequest & Required<Pick<ListAIAgentsRequest, 'pageToken'>>;

    renderHook(
      () =>
        useInfiniteQueryWithAllPages(listAIAgents, request, {
          enabled: false,
          getNextPageParam: (lastPage) => lastPage?.nextPageToken || undefined,
          pageParamKey: 'pageToken',
        }),
      { wrapper }
    );

    // Flush microtasks + one macrotask so a would-be fetch has a chance to run.
    // Avoids a hard setTimeout(r, 500) that both wastes wall time and leaks into
    // react-query's gcTime cleanup path.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callCount).toBe(0);
  });
});
