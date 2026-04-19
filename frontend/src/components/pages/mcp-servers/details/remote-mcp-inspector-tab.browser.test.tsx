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
import type { MCPServer } from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import {
  MCPServer_State,
  MCPServerSchema,
} from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import { mockConnectQuery, mockRouterForBrowserTest, ScreenshotFrame } from '../../../../__tests__/browser-test-utils';

type StreamOptions = { onProgress?: (p: { progress?: number; total?: number; statusMessage?: string; status?: string }) => void };

const mocks = vi.hoisted(() => ({
  getMCPServer: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null }>().mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  }),
  listTools: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null; isRefetchError: boolean; isRefetching: boolean }>().mockReturnValue({
    data: { tools: [] },
    isLoading: false,
    error: null,
    isRefetchError: false,
    isRefetching: false,
  }),
  listTopics: vi.fn<() => { data: unknown; refetch: () => void }>().mockReturnValue({
    data: { topics: [] },
    refetch: () => undefined,
  }),
  createTopic: vi.fn(),
  lastCapturedOnProgress: undefined as undefined | ((p: unknown) => void),
  streamState: {
    data: undefined as unknown,
    isPending: false as boolean,
    error: null as Error | null,
  },
}));

vi.mock('@tanstack/react-router', () => ({
  ...mockRouterForBrowserTest(),
  getRouteApi: () => ({
    useParams: () => ({ id: 'mcp-server-visual' }),
    useRouteContext: ({ select }: { select: (ctx: Record<string, unknown>) => unknown }) =>
      select({ gatewayUrl: 'http://localhost:8090' }),
  }),
}));
vi.mock('@connectrpc/connect-query', () => mockConnectQuery());

vi.mock('config', () => ({
  config: { jwt: 'test-jwt-token' },
  isFeatureFlagEnabled: vi.fn(() => false),
  isEmbedded: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
}));

vi.mock('react-query/api/remote-mcp', () => ({
  useGetMCPServerQuery: () => mocks.getMCPServer(),
  useListMCPServerTools: () => mocks.listTools(),
  useStreamMCPServerToolMutation: () => ({
    data: mocks.streamState.data,
    mutate: (params: StreamOptions) => {
      mocks.lastCapturedOnProgress = params.onProgress as (p: unknown) => void;
      mocks.streamState.isPending = true;
    },
    isPending: mocks.streamState.isPending,
    error: mocks.streamState.error,
    reset: () => {
      mocks.streamState.isPending = false;
      mocks.streamState.data = undefined;
      mocks.streamState.error = null;
    },
  }),
}));

vi.mock('react-query/api/topic', () => ({
  useLegacyListTopicsQuery: () => mocks.listTopics(),
  useCreateTopicMutation: () => ({ mutateAsync: mocks.createTopic }),
}));

const testServer: MCPServer = create(MCPServerSchema, {
  id: 'mcp-server-visual',
  displayName: 'Visual Regression Server',
  url: 'http://localhost:8090/mcp',
  state: MCPServer_State.RUNNING,
  tools: {
    'process-events': { componentType: 2, configYaml: 'processor: identity' },
  },
});

const { RemoteMCPInspectorTab } = await import('./remote-mcp-inspector-tab');

describe('RemoteMCPInspectorTab — browser visual regression', () => {
  test('streaming inspector shows Progress bar and status line mid-call', async () => {
    mocks.getMCPServer.mockReturnValue({
      data: { mcpServer: testServer },
      isLoading: false,
      error: null,
    });
    mocks.listTools.mockReturnValue({
      data: {
        tools: [
          {
            name: 'process-events',
            description: 'Transform a batch of events into structured output.',
            inputSchema: {
              type: 'object',
              properties: {
                batch_size: { type: 'integer', default: 10 },
              },
              required: ['batch_size'],
            },
          },
        ],
      },
      isLoading: false,
      error: null,
      isRefetchError: false,
      isRefetching: false,
    });
    mocks.streamState.data = undefined;
    mocks.streamState.isPending = false;
    mocks.streamState.error = null;

    render(
      <ScreenshotFrame width={1280}>
        <RemoteMCPInspectorTab />
      </ScreenshotFrame>
    );

    await expect.element(page.getByRole('button', { name: /run tool/i })).toBeVisible();

    // Start a call and emit a progress update so the Progress bar renders.
    await page.getByRole('button', { name: /run tool/i }).click();

    // Push a progress update through the captured onProgress callback so the
    // UI moves into the streaming state (Progress bar + status line).
    mocks.lastCapturedOnProgress?.({
      taskId: 'task-42',
      status: 'working',
      statusMessage: 'Processing batch 6/10...',
      progress: 6,
      total: 10,
    });

    await expect.element(page.getByTestId('mcp-tool-progress-bar')).toBeVisible();
    await expect.element(page.getByText('Processing batch 6/10...')).toBeVisible();

    await expect(page.getByTestId('screenshot-frame')).toMatchScreenshot('mcp-streaming-inspector');
  });
});
