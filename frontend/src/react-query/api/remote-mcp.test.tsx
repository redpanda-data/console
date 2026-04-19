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

const STREAM_TIMEOUT_50MS_REGEX = /MCP tool stream timed out after 50ms/;
const STREAM_TIMED_OUT_REGEX = /timed out/;
const STREAM_WATCHDOG_REGEX = /MCP tool stream ended without a terminal/;

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

type ServerCapabilitiesMock = {
  tools?: { listChanged?: boolean };
  tasks?: { requests?: { tools?: { call?: unknown } } } | undefined;
} | null;

let streamMessages: StreamMessage[] = [];
let streamYieldDelayMs = 0;
let streamHangForever = false;
let lastStreamOptions: StreamOptions | undefined;
let connectOrderLog: string[] = [];
let lastTransportOpts: { authProvider?: OAuthClientProvider; fetch?: typeof fetch } | undefined;
let lastClientInfo: { name: string; version: string } | undefined;
let nextConnectRejection: Error | undefined;
let streamConstructorSnapshots: number[] = [];
let serverCapabilitiesMock: ServerCapabilitiesMock = {
  tools: { listChanged: false },
  tasks: { requests: { tools: { call: {} } } },
};
const createdClients: unknown[] = [];
const callToolInvocations: { name: string; arguments: Record<string, unknown> }[] = [];

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class MockClient {
    transport?: { sessionId?: string; onerror?: (error: Error) => void };
    constructor(clientInfo: { name: string; version: string }) {
      lastClientInfo = clientInfo;
      createdClients.push(this);
    }
    connect = vi.fn((transport: { sessionId?: string; onerror?: (error: Error) => void }) => {
      if (nextConnectRejection) {
        const err = nextConnectRejection;
        nextConnectRejection = undefined;
        return Promise.reject(err);
      }
      this.transport = transport;
      connectOrderLog.push(`connect:onerror=${typeof transport.onerror}`);
      return Promise.resolve();
    });
    getServerCapabilities = vi.fn(() => serverCapabilitiesMock ?? undefined);
    listTools = vi.fn(() => Promise.resolve({ tools: [] }));
    callTool = vi.fn((params: { name: string; arguments: Record<string, unknown> }) => {
      callToolInvocations.push(params);
      return Promise.resolve({ content: [{ type: 'text', text: 'fallback-result' }] });
    });
    experimental = {
      tasks: {
        // biome-ignore lint/suspicious/useAwait: async generator with sync yields
        async *callToolStream(
          _toolArgs: { name: string; arguments: Record<string, unknown> },
          _request: unknown,
          opts?: StreamOptions
        ) {
          lastStreamOptions = opts;
          streamConstructorSnapshots.push(streamMessages.length);
          if (streamHangForever) {
            await new Promise<void>((resolve) => {
              opts?.signal?.addEventListener('abort', () => resolve());
            });
            return;
          }
          for (const message of streamMessages) {
            if (streamYieldDelayMs > 0) {
              await new Promise((r) => setTimeout(r, streamYieldDelayMs));
            }
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
  streamYieldDelayMs = 0;
  streamHangForever = false;
  lastStreamOptions = undefined;
  connectOrderLog = [];
  lastTransportOpts = undefined;
  lastClientInfo = undefined;
  nextConnectRejection = undefined;
  streamConstructorSnapshots = [];
  serverCapabilitiesMock = {
    tools: { listChanged: false },
    tasks: { requests: { tools: { call: {} } } },
  };
  createdClients.length = 0;
  callToolInvocations.length = 0;
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

    // The stream receives a composed signal (caller signal ⋃ internal timeout).
    expect(lastStreamOptions?.signal).toBeDefined();
  });

  test('pre-aborted caller signal short-circuits the composed signal', async () => {
    streamMessages = [{ type: 'result', result: { content: [] } }];

    const { wrapper } = connectQueryWrapper({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const controller = new AbortController();
    controller.abort();

    await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: {},
      signal: controller.signal,
    });

    // The composed signal surfaced to the SDK fired synchronously because the
    // caller's signal was already aborted at call time.
    expect(lastStreamOptions?.signal?.aborted).toBe(true);
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

describe('useStreamMCPServerToolMutation — capability fallback', () => {
  test('falls back to non-streaming callTool when the server does not advertise tasks.requests.tools.call', async () => {
    serverCapabilitiesMock = { tools: { listChanged: false } };

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const value = await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: { foo: 'bar' },
    });

    expect(value).toEqual({ content: [{ type: 'text', text: 'fallback-result' }] });
    expect(callToolInvocations).toHaveLength(1);
    expect(callToolInvocations[0]).toEqual({ name: 'my-tool', arguments: { foo: 'bar' } });
    // Stream path must not have been entered.
    expect(streamConstructorSnapshots).toHaveLength(0);
  });

  test('uses the streaming path when the server advertises tasks capability', async () => {
    serverCapabilitiesMock = {
      tools: { listChanged: false },
      tasks: { requests: { tools: { call: {} } } },
    };
    streamMessages = [{ type: 'result', result: { content: [{ type: 'text', text: 'streamed' }] } }];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const value = await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: {},
    });

    expect(value).toEqual({ content: [{ type: 'text', text: 'streamed' }] });
    expect(callToolInvocations).toHaveLength(0);
    expect(streamConstructorSnapshots).toHaveLength(1);
  });

  test('falls back when getServerCapabilities returns undefined entirely', async () => {
    serverCapabilitiesMock = null;

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: {},
    });

    expect(callToolInvocations).toHaveLength(1);
  });
});

describe('useStreamMCPServerToolMutation — timeout & watchdog', () => {
  test('rejects with a descriptive error when the stream never produces a terminal message before the timeout', async () => {
    streamHangForever = true;

    const { wrapper } = connectQueryWrapper({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    await expect(
      result.current.mutateAsync({
        serverUrl: 'https://example.test/mcp',
        toolName: 'my-tool',
        parameters: {},
        streamTimeoutMs: 50,
      })
    ).rejects.toThrow(STREAM_TIMEOUT_50MS_REGEX);
  });

  test('timeout path aborts the SDK signal so upstream fetches are cancelled', async () => {
    streamHangForever = true;

    const { wrapper } = connectQueryWrapper({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const abortStates: boolean[] = [];
    const promise = result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: {},
      streamTimeoutMs: 30,
    });

    await expect(promise).rejects.toThrow(STREAM_TIMED_OUT_REGEX);
    abortStates.push(lastStreamOptions?.signal?.aborted ?? false);
    expect(abortStates).toEqual([true]);
  });

  test('does not fire the timeout when a terminal result arrives first', async () => {
    streamMessages = [{ type: 'result', result: { content: [{ type: 'text', text: 'ok' }] } }];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const value = await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'my-tool',
      parameters: {},
      streamTimeoutMs: 500,
    });

    expect(value).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  test('rejects explicitly when the stream closes without any result or error message (watchdog)', async () => {
    // No messages at all — generator returns immediately. Current code throws a generic "stream ended without a result".
    streamMessages = [];

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
    ).rejects.toThrow(STREAM_WATCHDOG_REGEX);
  });
});

describe('useStreamMCPServerToolMutation — concurrency', () => {
  test('back-to-back calls each get a fresh client — no shared state leak', async () => {
    streamMessages = [{ type: 'result', result: { content: [{ type: 'text', text: 'parallel-ok' }] } }];

    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result: resultA } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });
    const { result: resultB } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const controllerA = new AbortController();
    const controllerB = new AbortController();

    const a = await resultA.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'tool-a',
      parameters: {},
      signal: controllerA.signal,
    });
    const b = await resultB.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'tool-b',
      parameters: {},
      signal: controllerB.signal,
    });

    expect(a).toEqual({ content: [{ type: 'text', text: 'parallel-ok' }] });
    expect(b).toEqual({ content: [{ type: 'text', text: 'parallel-ok' }] });
    expect(controllerA.signal).not.toBe(controllerB.signal);
    // Each call created a separate client — no shared state / singleton.
    expect(createdClients.length).toBeGreaterThanOrEqual(2);
  });

  test('cancelling one parallel call does not cancel the other', async () => {
    const { wrapper } = connectQueryWrapper({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result: resultA } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });
    const { result: resultB } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const controllerA = new AbortController();
    const controllerB = new AbortController();

    streamHangForever = true;
    const aPromise = resultA.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'tool-a',
      parameters: {},
      signal: controllerA.signal,
      streamTimeoutMs: 10_000,
    });
    // Let the first call enter the stream.
    await new Promise((r) => setTimeout(r, 10));

    streamHangForever = false;
    streamMessages = [{ type: 'result', result: { content: [{ type: 'text', text: 'b-done' }] } }];
    const bPromise = resultB.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'tool-b',
      parameters: {},
      signal: controllerB.signal,
    });

    const b = await bPromise;
    expect(b).toEqual({ content: [{ type: 'text', text: 'b-done' }] });
    expect(controllerB.signal.aborted).toBe(false);

    controllerA.abort();
    await expect(aPromise).rejects.toBeTruthy();
    // B was never aborted by A's cancellation.
    expect(controllerB.signal.aborted).toBe(false);
  });
});

describe('createMCPClientWithSession — transport error contract', () => {
  test('transport.onerror does not route through formatToastErrorMessageGRPC — toast is owned by mutation onError', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { transport } = await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');

    transport.onerror?.(new Error('sse drop'));

    expect(formatToastErrorMessageGRPCMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[MCP] transport error',
      expect.objectContaining({ serverUrl: 'https://example.test/mcp' })
    );

    errorSpy.mockRestore();
  });
});

describe('Integration — listTools then streaming callTool end-to-end', () => {
  test('happy path: list tools, then stream a call with progress and a final result', async () => {
    streamMessages = [
      { type: 'taskCreated', task: { taskId: 't-e2e', status: 'working' } },
      { type: 'taskStatus', task: { taskId: 't-e2e', status: 'working', statusMessage: '50%' } },
      { type: 'result', result: { content: [{ type: 'text', text: 'e2e-done' }] } },
    ];

    // 1. List tools via the session factory.
    const { client } = await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');
    const toolsRes = await client.listTools();
    expect(toolsRes.tools).toEqual([]);

    // 2. Stream a call through the mutation — progress + result arrive as expected.
    const { wrapper } = connectQueryWrapper({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useStreamMCPServerToolMutation(), { wrapper });

    const progressUpdates: MCPStreamProgress[] = [];
    const value = await result.current.mutateAsync({
      serverUrl: 'https://example.test/mcp',
      toolName: 'e2e-tool',
      parameters: { foo: 'bar' },
      onProgress: (u) => progressUpdates.push(u),
    });

    expect(value).toEqual({ content: [{ type: 'text', text: 'e2e-done' }] });
    expect(progressUpdates.map((u) => u.status)).toEqual(['working', 'working']);
    expect(progressUpdates.map((u) => u.statusMessage)).toEqual([undefined, '50%']);
  });
});

describe('createMCPClientWithSession — isolation & error propagation', () => {
  test('each call yields a fresh client — no hidden singleton', async () => {
    const r1 = await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');
    const r2 = await createMCPClientWithSession('https://example.test/mcp', 'redpanda-console');

    expect(r1.client).not.toBe(r2.client);
    expect(r1.transport).not.toBe(r2.transport);
    expect(createdClients).toHaveLength(2);
  });

  test('connect() failure propagates and leaves no half-initialized client usable', async () => {
    nextConnectRejection = new Error('connect refused');

    await expect(createMCPClientWithSession('https://example.test/mcp', 'redpanda-console')).rejects.toThrow(
      'connect refused'
    );
  });
});
