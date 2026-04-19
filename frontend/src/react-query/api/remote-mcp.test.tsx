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
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ListMCPServersResponseSchema, MCPServerSchema } from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import { listMCPServers } from 'protogen/redpanda/api/dataplane/v1/mcp-MCPServerService_connectquery';
import { connectQueryWrapper } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ConsoleJWTOAuthProvider } from './mcp-oauth-provider';
import type { MCPStreamProgress } from './remote-mcp';
import { createMCPClientWithSession, useListMCPServersQuery, useStreamMCPServerToolMutation } from './remote-mcp';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
  },
}));

const formatToastErrorMessageGRPCMock = vi.fn(() => 'formatted error');
vi.mock('utils/toast.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('utils/toast.utils')>();
  return {
    ...actual,
    formatToastErrorMessageGRPC: (...args: Parameters<typeof actual.formatToastErrorMessageGRPC>) =>
      formatToastErrorMessageGRPCMock(...args),
  };
});

type StreamMessage =
  | { type: 'taskCreated'; task: { taskId: string; status: string; statusMessage?: string } }
  | { type: 'taskStatus'; task: { taskId: string; status: string; statusMessage?: string } }
  | { type: 'result'; result: { content: Array<{ type: string; text?: string }> } }
  | { type: 'error'; error: Error };

type StreamOptions = {
  signal?: AbortSignal;
  onprogress?: (progress: { progress: number; total?: number }) => void;
};

let streamMessages: StreamMessage[] = [];
let lastStreamOptions: StreamOptions | undefined;
let connectOrderLog: string[] = [];
let lastTransportOpts: { authProvider?: OAuthClientProvider; fetch?: typeof fetch } | undefined;
let lastClientInfo: { name: string; version: string } | undefined;

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class MockClient {
    transport?: { sessionId?: string; onerror?: (error: Error) => void };
    constructor(clientInfo: { name: string; version: string }) {
      lastClientInfo = clientInfo;
    }
    connect = vi.fn((transport: { sessionId?: string; onerror?: (error: Error) => void }) => {
      this.transport = transport;
      connectOrderLog.push(`connect:onerror=${typeof transport.onerror}`);
      return Promise.resolve();
    });
    listTools = vi.fn(() => Promise.resolve({ tools: [] }));
    callTool = vi.fn(() => Promise.resolve({ content: [] }));
    experimental = {
      tasks: {
        // biome-ignore lint/suspicious/useAwait: async generator with sync yields
        async *callToolStream(
          _toolArgs: { name: string; arguments: Record<string, unknown> },
          _request: unknown,
          opts?: StreamOptions
        ) {
          lastStreamOptions = opts;
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
    url: URL;
    opts: { authProvider?: OAuthClientProvider; fetch?: typeof fetch };
    constructor(url: URL, opts: { authProvider?: OAuthClientProvider; fetch?: typeof fetch }) {
      this.url = url;
      this.opts = opts;
      lastTransportOpts = opts;
    }
  }
  return { StreamableHTTPClientTransport: MockStreamableHTTPClientTransport };
});

beforeEach(() => {
  streamMessages = [];
  lastStreamOptions = undefined;
  connectOrderLog = [];
  lastTransportOpts = undefined;
  lastClientInfo = undefined;
  formatToastErrorMessageGRPCMock.mockClear();
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

  test('assigns transport.onerror before calling client.connect', async () => {
    await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');

    expect(connectOrderLog).toEqual(['connect:onerror=function']);
  });

  test('transport.onerror handler does not throw so the promise chain stays alive', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { transport } = await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');

    expect(() => transport.onerror?.(new Error('boom'))).not.toThrow();

    errorSpy.mockRestore();
  });

  test('passes a ConsoleJWTOAuthProvider to the transport constructor', async () => {
    await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');

    expect(lastTransportOpts?.authProvider).toBeInstanceOf(ConsoleJWTOAuthProvider);
  });

  test('custom fetch injects Mcp-Session-Id header belt-and-suspenders with auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const { transport } = await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');
    const transportFetch = lastTransportOpts?.fetch;
    expect(transportFetch).toBeDefined();

    (transport as unknown as { sessionId?: string }).sessionId = 'sess-42';

    await transportFetch?.('https://example.test/mcp', { method: 'POST' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as [unknown, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBe('Bearer test-jwt-token');
    expect(headers['Mcp-Session-Id']).toBe('sess-42');

    fetchSpy.mockRestore();
  });

  test('passes clientName through and pins SDK client version at 1.0.0', async () => {
    await createMCPClientWithSession('https://example.test/mcp', 'some-client');

    expect(lastClientInfo).toEqual({ name: 'some-client', version: '1.0.0' });
  });

  test('returns the { client, transport } shape', async () => {
    const result = await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');

    expect(Object.keys(result).sort()).toEqual(['client', 'transport']);
    expect(result.client).toBeDefined();
    expect(result.transport).toBeDefined();
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

  test('forwards numeric progress from the SDK onprogress callback', async () => {
    streamMessages = [{ type: 'result', result: { content: [] } }];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const progressUpdates: MCPStreamProgress[] = [];

    const mutationPromise = result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: {},
      onProgress: (update) => progressUpdates.push(update),
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      lastStreamOptions?.onprogress?.({ progress: 3, total: 10 });
      lastStreamOptions?.onprogress?.({ progress: 7, total: 10 });
      await mutationPromise;
    });

    expect(progressUpdates).toContainEqual({ progress: 3, total: 10 });
    expect(progressUpdates).toContainEqual({ progress: 7, total: 10 });
  });

  test('passes the AbortSignal through to the SDK call', async () => {
    streamMessages = [{ type: 'result', result: { content: [] } }];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const controller = new AbortController();

    await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: {},
      signal: controller.signal,
    });

    expect(lastStreamOptions?.signal).toBe(controller.signal);
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

  test('resolves with the terminal result message payload (non-streaming call compatibility)', async () => {
    const terminalPayload = { content: [{ type: 'text', text: 'final' }] };
    streamMessages = [{ type: 'result', result: terminalPayload }];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const value = await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: {},
    });

    expect(value).toEqual(terminalPayload);
  });

  test('rejects when the stream yields an error event before a result', async () => {
    streamMessages = [
      { type: 'taskCreated', task: { taskId: 't1', status: 'working' } },
      { type: 'error', error: new Error('upstream failed') },
    ];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    await expect(
      result.current.mutateAsync({
        serverUrl: 'https://example.test/mcp',
        toolName: 'my-tool',
        parameters: {},
      })
    ).rejects.toThrow('upstream failed');
  });

  test('routes non-abort errors through formatToastErrorMessageGRPC with action=call entity=MCP tool', async () => {
    streamMessages = [{ type: 'error', error: new Error('boom') }];

    const { wrapper } = connectQueryWrapper({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    await expect(
      result.current.mutateAsync({
        serverUrl: 'https://example.test/mcp',
        toolName: 'my-tool',
        parameters: {},
      })
    ).rejects.toThrow('boom');

    expect(formatToastErrorMessageGRPCMock).toHaveBeenCalledTimes(1);
    expect(formatToastErrorMessageGRPCMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'call', entity: 'MCP tool' })
    );
  });

  test('does not surface a toast when the error is an AbortError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    streamMessages = [{ type: 'error', error: abortErr }];

    const { wrapper } = connectQueryWrapper({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    await expect(
      result.current.mutateAsync({
        serverUrl: 'https://example.test/mcp',
        toolName: 'my-tool',
        parameters: {},
      })
    ).rejects.toBe(abortErr);

    expect(formatToastErrorMessageGRPCMock).not.toHaveBeenCalled();
  });
});
