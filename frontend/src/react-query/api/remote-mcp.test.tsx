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
import { ListMCPServersResponseSchema, MCPServerSchema } from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import { listMCPServers } from 'protogen/redpanda/api/dataplane/v1/mcp-MCPServerService_connectquery';
import { connectQueryWrapper } from 'test-utils';
import { describe, expect, test } from 'vitest';

import { useListMCPServersQuery } from './remote-mcp';

describe('useListMCPServersQuery', () => {
  test('fetches all pages and flattens servers into a single array', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listMCPServers, (req) => {
        callCount += 1;
        const pageToken = req.pageToken;

        if (pageToken === '') {
          return create(ListMCPServersResponseSchema, {
            mcpServers: [create(MCPServerSchema, { id: 'server-1', displayName: 'Server 1' })],
            nextPageToken: 'page2',
          });
        }
        if (pageToken === 'page2') {
          return create(ListMCPServersResponseSchema, {
            mcpServers: [create(MCPServerSchema, { id: 'server-2', displayName: 'Server 2' })],
            nextPageToken: 'page3',
          });
        }
        return create(ListMCPServersResponseSchema, {
          mcpServers: [create(MCPServerSchema, { id: 'server-3', displayName: 'Server 3' })],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.mcpServers).toHaveLength(3);
    });

    expect(callCount).toBe(3);
    expect(result.current.data.mcpServers.map((s) => s.id)).toEqual(['server-1', 'server-2', 'server-3']);
  });

  test('returns all data in a single page when no nextPageToken', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listMCPServers, () => {
        callCount += 1;
        return create(ListMCPServersResponseSchema, {
          mcpServers: [
            create(MCPServerSchema, { id: 'server-1', displayName: 'Server 1' }),
            create(MCPServerSchema, { id: 'server-2', displayName: 'Server 2' }),
          ],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data.mcpServers).toHaveLength(2);
    });

    expect(callCount).toBe(1);
  });

  test('handles empty result', async () => {
    let callCount = 0;

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listMCPServers, () => {
        callCount += 1;
        return create(ListMCPServersResponseSchema, {
          mcpServers: [],
          nextPageToken: '',
        });
      });
    });

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } }, transport);

    const { result } = renderHook(() => useListMCPServersQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(callCount).toBe(1);
    expect(result.current.data.mcpServers).toHaveLength(0);
  });
});
