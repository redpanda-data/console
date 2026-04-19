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
import { describe, expect, test, vi } from 'vitest';

import type { MCPStreamProgress } from './remote-mcp';
import { createMCPClientWithSession, useListMCPServersQuery, useStreamMCPServerToolMutation } from './remote-mcp';

type StreamMessage =
  | { type: 'taskCreated'; task: { taskId: string; status: string; statusMessage?: string } }
  | { type: 'taskStatus'; task: { taskId: string; status: string; statusMessage?: string } }
  | { type: 'result'; result: { content: Array<{ type: string; text?: string }> } }
  | { type: 'error'; error: Error };

let streamMessages: StreamMessage[] = [];

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class MockClient {
    transport?: { sessionId?: string };
    connect = vi.fn(async (transport: { sessionId?: string }) => {
      this.transport = transport;
    });
    listTools = vi.fn(async () => ({ tools: [] }));
    callTool = vi.fn(async () => ({ content: [] }));
    experimental = {
      tasks: {
        callToolStream: async function* () {
          for (const message of streamMessages) {
            yield message;
          }
        },
      },
    };
  }
  return { Client: MockClient };
});

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  class MockStreamableHTTPClientTransport {
    sessionId?: string;
    onerror?: (error: Error) => void;
    constructor(public url: URL, public opts: unknown) {}
  }
  return { StreamableHTTPClientTransport: MockStreamableHTTPClientTransport };
});

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

describe('createMCPClientWithSession', () => {
  test('wires transport.onerror to log transport-level failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { client, transport } = await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');

    expect(client).toBeDefined();
    expect(transport).toBeDefined();
    expect(typeof transport.onerror).toBe('function');

    transport.onerror?.(new Error('boom'));

    expect(errorSpy).toHaveBeenCalledWith(
      '[MCP] transport error',
      expect.objectContaining({ serverUrl: 'https://example.test/mcp' })
    );

    errorSpy.mockRestore();
  });
});

describe('useStreamMCPServerToolMutation', () => {
  test('emits progress updates and resolves with the final result', async () => {
    streamMessages = [
      { type: 'taskCreated', task: { taskId: 't1', status: 'working' } },
      { type: 'taskStatus', task: { taskId: 't1', status: 'working', statusMessage: 'halfway' } },
      { type: 'result', result: { content: [{ type: 'text', text: 'done' }] } },
    ];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const progressUpdates: MCPStreamProgress[] = [];

    const value = await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: { foo: 'bar' },
      onProgress: (update) => progressUpdates.push(update),
    });

    expect(value).toEqual({ content: [{ type: 'text', text: 'done' }] });
    expect(progressUpdates).toHaveLength(2);
    expect(progressUpdates[0]).toEqual({ taskId: 't1', status: 'working', statusMessage: undefined });
    expect(progressUpdates[1]).toEqual({ taskId: 't1', status: 'working', statusMessage: 'halfway' });
  });

  test('throws when the stream ends without a result', async () => {
    streamMessages = [{ type: 'error', error: new Error('server died') }];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    await expect(
      result.current.mutateAsync({
        serverUrl: 'https://example.test/mcp',
        toolName: 'my-tool',
        parameters: {},
      })
    ).rejects.toThrow('server died');
  });
});
