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

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import {
  GetMCPServerResponseSchema,
  ListMCPServersResponseSchema,
  MCPServer_State,
  MCPServerSchema,
} from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import { getMCPServer, listMCPServers } from 'protogen/redpanda/api/dataplane/v1/mcp-MCPServerService_connectquery';
import { ListTopicsResponseSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
  },
}));

const SERVER_ID = 'server-1';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    getRouteApi: () => ({
      useParams: () => ({ id: SERVER_ID }),
    }),
  };
});

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

type StreamMessage =
  | { type: 'taskStatus'; task: { taskId: string; status: string; statusMessage?: string } }
  | { type: 'result'; result: { content: Array<{ type: string; text?: string }> } }
  | { type: 'error'; error: Error };

let progressBeforeGate: StreamMessage[] = [];
let messagesAfterGate: StreamMessage[] = [];
let streamGate: Promise<void> = Promise.resolve();
let releaseStream: () => void = () => undefined;
let lastStreamSignal: AbortSignal | undefined;
let onprogressHandoff: ((p: { progress: number; total?: number }) => void) | undefined;

let toolsResponse: {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: { type: 'object'; properties: Record<string, unknown> };
  }>;
} = {
  tools: [
    {
      name: 'echo',
      description: 'Echo tool',
      inputSchema: { type: 'object' as const, properties: {} },
    },
  ],
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class MockClient {
    transport?: { sessionId?: string; onerror?: (error: Error) => void };
    connect = vi.fn((transport: { sessionId?: string; onerror?: (error: Error) => void }) => {
      this.transport = transport;
      return Promise.resolve();
    });
    getServerCapabilities = vi.fn(() => ({
      tasks: { requests: { tools: { call: {} } } },
    }));
    listTools = vi.fn(() => Promise.resolve(toolsResponse));
    callTool = vi.fn(() => Promise.resolve({ content: [] }));
    experimental = {
      tasks: {
        async *callToolStream(
          _args: unknown,
          _request: unknown,
          opts?: { signal?: AbortSignal; onprogress?: (p: { progress: number; total?: number }) => void }
        ) {
          lastStreamSignal = opts?.signal;
          onprogressHandoff = opts?.onprogress;
          for (const message of progressBeforeGate) {
            yield message;
          }
          await streamGate;
          for (const message of messagesAfterGate) {
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
    readonly url: URL;
    readonly opts: unknown;
    sessionId?: string;
    onerror?: (error: Error) => void;
    constructor(url: URL, opts: unknown) {
      this.url = url;
      this.opts = opts;
    }
  }
  return { StreamableHTTPClientTransport: MockStreamableHTTPClientTransport };
});

const makeTransport = () => {
  const server = create(MCPServerSchema, {
    id: SERVER_ID,
    displayName: 'Test Server',
    url: 'http://localhost:8080',
    state: MCPServer_State.RUNNING,
    tools: {
      echo: { componentType: 1, configYaml: 'test: config' },
    },
  });
  return createRouterTransport(({ rpc }) => {
    rpc(getMCPServer, () => create(GetMCPServerResponseSchema, { mcpServer: server }));
    rpc(listMCPServers, () => create(ListMCPServersResponseSchema, { mcpServers: [server], nextPageToken: '' }));
    rpc(listTopics, () => create(ListTopicsResponseSchema, { topics: [] }));
  });
};

import { RemoteMCPInspectorTab } from './remote-mcp-inspector-tab';

const freshStreamGate = () => {
  streamGate = new Promise<void>((resolve) => {
    releaseStream = resolve;
  });
};

const RUN_TOOL_REGEX = /run tool/i;
const CANCEL_REGEX = /^cancel$/i;

describe('RemoteMCPInspectorTab — streaming progress UI', () => {
  beforeEach(() => {
    progressBeforeGate = [];
    messagesAfterGate = [];
    lastStreamSignal = undefined;
    onprogressHandoff = undefined;
    toolsResponse = {
      tools: [
        {
          name: 'echo',
          description: 'Echo tool',
          inputSchema: { type: 'object' as const, properties: {} },
        },
      ],
    };
    toastErrorMock.mockClear();
    toastSuccessMock.mockClear();
    freshStreamGate();
  });

  test('renders the registry Progress bar and status line while a tool call is pending', async () => {
    const user = userEvent.setup();
    progressBeforeGate = [{ type: 'taskStatus', task: { taskId: 't1', status: 'working', statusMessage: 'halfway' } }];
    messagesAfterGate = [{ type: 'result', result: { content: [{ type: 'text', text: '"ok"' }] } }];

    renderWithFileRoutes(<RemoteMCPInspectorTab />, { transport: makeTransport() });

    const runButton = await screen.findByRole('button', { name: RUN_TOOL_REGEX });
    await waitFor(() => expect(runButton).toBeEnabled());

    await user.click(runButton);

    const progressContainer = await screen.findByTestId('mcp-tool-progress');
    expect(progressContainer).toBeVisible();

    const progressBar = await screen.findByTestId('mcp-tool-progress-bar');
    expect(progressBar).toHaveAttribute('data-slot', 'progress');

    expect(await screen.findByText('halfway')).toBeVisible();
  });

  test('hides the progress UI once the stream resolves', async () => {
    const user = userEvent.setup();
    progressBeforeGate = [{ type: 'taskStatus', task: { taskId: 't1', status: 'working', statusMessage: 'halfway' } }];
    messagesAfterGate = [{ type: 'result', result: { content: [{ type: 'text', text: '"done"' }] } }];

    renderWithFileRoutes(<RemoteMCPInspectorTab />, { transport: makeTransport() });

    const runButton = await screen.findByRole('button', { name: RUN_TOOL_REGEX });
    await waitFor(() => expect(runButton).toBeEnabled());

    await user.click(runButton);

    await screen.findByTestId('mcp-tool-progress-bar');

    releaseStream();

    await waitFor(() => {
      expect(screen.queryByTestId('mcp-tool-progress-bar')).toBeNull();
    });
  });

  test('surfaces exactly one toast on non-abort errors — mutation owns the toast, component does not double-fire', async () => {
    const user = userEvent.setup();
    messagesAfterGate = [{ type: 'error', error: new Error('server blew up') }];

    renderWithFileRoutes(<RemoteMCPInspectorTab />, { transport: makeTransport() });

    const runButton = await screen.findByRole('button', { name: RUN_TOOL_REGEX });
    await waitFor(() => expect(runButton).toBeEnabled());

    await user.click(runButton);
    releaseStream();

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
    });
    const message = toastErrorMock.mock.calls[0]?.[0] as string;
    expect(message).toContain('MCP tool');
    expect(message).toContain('server blew up');
  });

  test('clicking Cancel aborts the signal without firing a toast', async () => {
    const user = userEvent.setup();
    messagesAfterGate = [{ type: 'result', result: { content: [] } }];

    renderWithFileRoutes(<RemoteMCPInspectorTab />, { transport: makeTransport() });

    const runButton = await screen.findByRole('button', { name: RUN_TOOL_REGEX });
    await waitFor(() => expect(runButton).toBeEnabled());

    await user.click(runButton);

    const cancelButton = await screen.findByRole('button', { name: CANCEL_REGEX });
    await waitFor(() => expect(lastStreamSignal).toBeDefined());

    await user.click(cancelButton);

    expect(lastStreamSignal?.aborted).toBe(true);
    releaseStream();

    await waitFor(() => {
      expect(toastErrorMock).not.toHaveBeenCalled();
    });
  });

  test('numeric progress from SDK onprogress merges with task status from the stream', async () => {
    const user = userEvent.setup();
    progressBeforeGate = [{ type: 'taskStatus', task: { taskId: 't1', status: 'working', statusMessage: 'halfway' } }];
    messagesAfterGate = [{ type: 'result', result: { content: [{ type: 'text', text: '"ok"' }] } }];

    renderWithFileRoutes(<RemoteMCPInspectorTab />, { transport: makeTransport() });

    const runButton = await screen.findByRole('button', { name: RUN_TOOL_REGEX });
    await waitFor(() => expect(runButton).toBeEnabled());
    await user.click(runButton);

    await screen.findByText('halfway');
    await waitFor(() => expect(onprogressHandoff).toBeDefined());

    onprogressHandoff?.({ progress: 50, total: 100 });

    await waitFor(() => {
      const bar = screen.queryByTestId('mcp-tool-progress-bar');
      expect(bar?.getAttribute('data-value')).toBe('50');
    });
    expect(screen.queryByText('halfway')).toBeVisible();

    releaseStream();
  });

  test('Progress value clamps to [0, 100] when the server sends out-of-range numbers', async () => {
    const user = userEvent.setup();
    messagesAfterGate = [{ type: 'result', result: { content: [{ type: 'text', text: '"ok"' }] } }];

    renderWithFileRoutes(<RemoteMCPInspectorTab />, { transport: makeTransport() });

    const runButton = await screen.findByRole('button', { name: RUN_TOOL_REGEX });
    await waitFor(() => expect(runButton).toBeEnabled());

    await user.click(runButton);

    await waitFor(() => expect(onprogressHandoff).toBeDefined());

    // > 100%
    onprogressHandoff?.({ progress: 200, total: 100 });
    await waitFor(() => {
      const bar = screen.queryByTestId('mcp-tool-progress-bar');
      expect(bar).toBeTruthy();
      const value = bar?.getAttribute('data-value');
      expect(value).not.toBeNull();
      expect(Number(value)).toBeLessThanOrEqual(100);
      expect(Number(value)).toBeGreaterThanOrEqual(0);
    });

    // < 0%
    onprogressHandoff?.({ progress: -5, total: 10 });
    await waitFor(() => {
      const bar = screen.queryByTestId('mcp-tool-progress-bar');
      const value = bar?.getAttribute('data-value');
      expect(Number(value)).toBeGreaterThanOrEqual(0);
    });

    // NaN (total = 0 → division by zero NaN handled as undefined)
    onprogressHandoff?.({ progress: 5, total: 0 });
    await waitFor(() => {
      const bar = screen.queryByTestId('mcp-tool-progress-bar');
      expect(bar).toBeTruthy();
      const value = bar?.getAttribute('data-value');
      // Either indeterminate (no data-value) or a valid clamped number.
      if (value !== null && value !== undefined) {
        const n = Number(value);
        if (!Number.isNaN(n)) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(100);
        }
      }
    });

    releaseStream();
  });

  test('switching tools mid-stream clears any in-flight progress UI', async () => {
    const user = userEvent.setup();
    toolsResponse = {
      tools: [
        { name: 'echo', description: 'Echo tool', inputSchema: { type: 'object' as const, properties: {} } },
        { name: 'reverse', description: 'Reverse tool', inputSchema: { type: 'object' as const, properties: {} } },
      ],
    };
    progressBeforeGate = [{ type: 'taskStatus', task: { taskId: 't1', status: 'working', statusMessage: 'halfway' } }];
    messagesAfterGate = [{ type: 'result', result: { content: [] } }];

    renderWithFileRoutes(<RemoteMCPInspectorTab />, { transport: makeTransport() });

    // Wait for two tools to render.
    const echoButton = await screen.findByText('echo');
    await screen.findByText('reverse');

    // Select echo first and run.
    await user.click(echoButton);
    const runButton = await screen.findByRole('button', { name: RUN_TOOL_REGEX });
    await waitFor(() => expect(runButton).toBeEnabled());
    await user.click(runButton);

    // Progress surfaces.
    await screen.findByTestId('mcp-tool-progress-bar');
    expect(await screen.findByText('halfway')).toBeVisible();

    // Switch to reverse — progress UI must clear.
    const reverseButton = await screen.findByText('reverse');
    await user.click(reverseButton);

    await waitFor(() => {
      expect(screen.queryByTestId('mcp-tool-progress-bar')).toBeNull();
      expect(screen.queryByText('halfway')).toBeNull();
    });

    releaseStream();
  });
});
