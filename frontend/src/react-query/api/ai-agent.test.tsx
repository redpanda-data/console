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
import { AIAgentSchema, ListAIAgentsResponseSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { listAIAgents } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { connectQueryWrapper } from 'test-utils';
import { describe, expect, test } from 'vitest';

import { useListAIAgentsQuery } from './ai-agent';

describe('useListAIAgentsQuery', () => {
  test('fetches all pages and flattens agents into a single array', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, (req) => {
        callCount += 1;
        const pageToken = req.pageToken;

        if (pageToken === '') {
          return create(ListAIAgentsResponseSchema, {
            aiAgents: [create(AIAgentSchema, { id: 'agent-1', displayName: 'Agent 1' })],
            nextPageToken: 'page2',
          });
        }
        if (pageToken === 'page2') {
          return create(ListAIAgentsResponseSchema, {
            aiAgents: [create(AIAgentSchema, { id: 'agent-2', displayName: 'Agent 2' })],
            nextPageToken: 'page3',
          });
        }
        return create(ListAIAgentsResponseSchema, {
          aiAgents: [create(AIAgentSchema, { id: 'agent-3', displayName: 'Agent 3' })],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListAIAgentsQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.aiAgents).toHaveLength(3);
    });

    expect(callCount).toBe(3);
    expect(result.current.data.aiAgents.map((a) => a.id)).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });

  test('with page size 1, fetches once per record', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, (req) => {
        callCount += 1;
        const pageToken = req.pageToken;

        if (pageToken === '') {
          return create(ListAIAgentsResponseSchema, {
            aiAgents: [create(AIAgentSchema, { id: 'agent-1', displayName: 'Agent 1' })],
            nextPageToken: 'page2',
          });
        }
        // Last page
        return create(ListAIAgentsResponseSchema, {
          aiAgents: [create(AIAgentSchema, { id: 'agent-2', displayName: 'Agent 2' })],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListAIAgentsQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.aiAgents).toHaveLength(2);
    });

    // With page size 1 and 2 records, the query should execute exactly twice
    expect(callCount).toBe(2);
    expect(result.current.data.aiAgents.map((a) => a.id)).toEqual(['agent-1', 'agent-2']);
  });

  test('returns all data in a single page when no nextPageToken', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, () => {
        callCount += 1;
        return create(ListAIAgentsResponseSchema, {
          aiAgents: [
            create(AIAgentSchema, { id: 'agent-1', displayName: 'Agent 1' }),
            create(AIAgentSchema, { id: 'agent-2', displayName: 'Agent 2' }),
          ],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListAIAgentsQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.aiAgents).toHaveLength(2);
    });

    expect(callCount).toBe(1);
  });

  test('handles empty result', async () => {
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

    const { result } = renderHook(() => useListAIAgentsQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(callCount).toBe(1);
    expect(result.current.data.aiAgents).toHaveLength(0);
  });
});
