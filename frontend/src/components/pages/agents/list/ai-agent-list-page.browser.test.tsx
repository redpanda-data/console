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
import type { AIAgent } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { AIAgent_State, AIAgentSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import {
  getRouteComponent,
  mockConnectQuery,
  mockRouterForBrowserTest,
  ScreenshotFrame,
} from '../../../../__tests__/browser-test-utils';

// Hoisted mocks — `vi.mock` factories run before module imports, so any state
// they reference must be declared via `vi.hoisted()` to survive hoisting.
const mocks = vi.hoisted(() => ({
  listAgents: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null }>().mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  }),
  listMCPServers: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null }>().mockReturnValue({
    data: { mcpServers: [] },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@tanstack/react-router', () => mockRouterForBrowserTest());
vi.mock('@connectrpc/connect-query', () => mockConnectQuery());

vi.mock('config', () => ({
  config: { jwt: 'test-jwt-token', controlplaneUrl: 'http://localhost:9090' },
  isFeatureFlagEnabled: vi.fn(() => false),
  isEmbedded: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
}));

vi.mock('state/ui-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('state/ui-state')>();
  return {
    ...actual,
    uiState: { pageTitle: '', pageBreadcrumbs: [] },
  };
});

vi.mock('react-query/api/ai-agent', () => ({
  useListAIAgentsQuery: () => mocks.listAgents(),
  useDeleteAIAgentMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('react-query/api/remote-mcp', () => ({
  useListMCPServersQuery: () => mocks.listMCPServers(),
}));

vi.mock('react-query/api/secret', () => ({
  useDeleteSecretMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// Stub the delete handler because it pulls in useControlplaneTransport, which
// requires a full config singleton that's costly to reproduce in browser mode.
vi.mock('./ai-agent-delete-handler', () => ({
  AIAgentDeleteHandler: ({ children }: { children: React.ReactNode }) => children,
}));

const { AIAgentsListPage } = await import('./ai-agent-list-page');

// Route-component extraction guard — exercises getRouteComponent for parity
// with ADP UI's canonical browser test even though AIAgentsListPage is a
// plain component rather than a Route export.
getRouteComponent({ component: AIAgentsListPage });

const testAgents: AIAgent[] = [
  create(AIAgentSchema, {
    id: 'agent-support',
    displayName: 'Customer Support Agent',
    description: 'Handles tier-1 customer support tickets via Zendesk.',
    state: AIAgent_State.RUNNING,
    provider: { provider: { case: 'openai', value: { apiKey: 'key' } } },
    model: 'gpt-4',
    systemPrompt: 'You are a helpful support agent.',
    mcpServers: { server1: { id: 'server-1' } },
    tags: { env: 'production', team: 'support' },
  }),
  create(AIAgentSchema, {
    id: 'agent-docs',
    displayName: 'Product Docs Agent',
    description: 'Answers questions about product documentation.',
    state: AIAgent_State.STOPPED,
    provider: { provider: { case: 'anthropic', value: { apiKey: 'key' } } },
    model: 'claude-3-5-sonnet',
    systemPrompt: 'You are a documentation assistant.',
    mcpServers: { server2: { id: 'server-2' } },
    tags: { env: 'staging' },
  }),
  create(AIAgentSchema, {
    id: 'agent-wiki',
    displayName: 'Internal Wiki Agent',
    description: 'Internal runbooks and wiki — no MCP tools.',
    state: AIAgent_State.STARTING,
    provider: { provider: { case: 'google', value: { apiKey: 'key' } } },
    model: 'gemini-2.0-flash',
    systemPrompt: 'You are a wiki assistant.',
    mcpServers: {},
    tags: {},
  }),
];

describe('AIAgentsListPage — browser visual regression', () => {
  test('populated table with filters, status icons, and heading', async () => {
    mocks.listAgents.mockReturnValue({
      data: { aiAgents: testAgents },
      isLoading: false,
      error: null,
    });

    render(
      <ScreenshotFrame width={1280}>
        <AIAgentsListPage />
      </ScreenshotFrame>
    );

    await expect.element(page.getByText('Customer Support Agent')).toBeVisible();
    await expect.element(page.getByText('Product Docs Agent')).toBeVisible();
    await expect.element(page.getByText('Internal Wiki Agent')).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'AI Agents' })).toBeVisible();

    await expect(page.getByTestId('screenshot-frame')).toMatchScreenshot('ai-agent-list-populated');
  });
});
