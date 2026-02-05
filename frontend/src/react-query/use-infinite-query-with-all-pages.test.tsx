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
  ListAIAgentsResponseSchema,
  AIAgentSchema,
  ListAIAgentsRequestSchema,
  type ListAIAgentsRequest,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { listAIAgents } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { connectQueryWrapper } from 'test-utils';
import { describe, expect, test } from 'vitest';
import { useInfiniteQueryWithAllPages } from './use-infinite-query-with-all-pages';

describe('useInfiniteQueryWithAllPages', () => {
  test('fetches all pages automatically', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, (request) => {
        callCount++;
        const pageToken = request.pageToken;

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
      rpc(listAIAgents, (request) => {
        callCount++;
        const pageToken = request.pageToken;

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

    // Wait for error state
    await waitFor(
      () => {
        expect(result.current.isFetching).toBe(false);
      },
      { timeout: 5000 }
    );

    // Give time to ensure no infinite loop (would cause many more calls)
    await new Promise((resolve) => setTimeout(resolve, 500));

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
        callCount++;
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

    // Wait a bit to ensure no calls are made
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(callCount).toBe(0);
  });
});
