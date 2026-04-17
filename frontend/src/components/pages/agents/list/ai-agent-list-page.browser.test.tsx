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
  listAIAgents: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null }>().mockReturnValue({
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
  useListAIAgentsQuery: () => mocks.listAIAgents(),
  useDeleteAIAgentMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useStartAIAgentMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useStopAIAgentMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('react-query/api/remote-mcp', () => ({
  useListMCPServersQuery: () => mocks.listMCPServers(),
}));

vi.mock('react-query/api/secret', () => ({
  useDeleteSecretMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const { AIAgentsListPage } = await import('./ai-agent-list-page');

// Route-component extraction guard — exercises getRouteComponent for parity
// with the ADP UI browser-test pattern.
getRouteComponent({ component: AIAgentsListPage });

const testAIAgents: AIAgent[] = [
  create(AIAgentSchema, {
    id: 'agent-support',
    displayName: 'Customer Support Agent',
    description: 'Answers customer questions from the product docs knowledge base.',
    state: AIAgent_State.RUNNING,
    provider: {
      provider: {
        case: 'openai',
        value: { apiKey: 'secret-support' },
      },
    },
    model: 'gpt-4',
    systemPrompt: 'You are a helpful customer support agent.',
    mcpServers: {},
    tags: { env: 'production', team: 'support' },
  }),
  create(AIAgentSchema, {
    id: 'agent-release-notes',
    displayName: 'Release Notes Writer',
    description: 'Drafts release notes from commit history.',
    state: AIAgent_State.STOPPED,
    provider: {
      provider: {
        case: 'anthropic',
        value: { apiKey: 'secret-release-notes' },
      },
    },
    model: 'claude-3.5-sonnet',
    systemPrompt: 'You write concise release notes.',
    mcpServers: {},
    tags: { env: 'staging' },
  }),
  create(AIAgentSchema, {
    id: 'agent-triage',
    displayName: 'Issue Triage Agent',
    description: 'Classifies incoming issues by severity.',
    state: AIAgent_State.RUNNING,
    provider: {
      provider: {
        case: 'openai',
        value: { apiKey: 'secret-triage' },
      },
    },
    model: 'gpt-4o-mini',
    systemPrompt: 'You classify issues.',
    mcpServers: {},
    tags: {},
  }),
];

describe('AIAgentsListPage — browser visual regression', () => {
  test('populated table with filters, status chips, and pagination footer', async () => {
    mocks.listAIAgents.mockReturnValue({
      data: { aiAgents: testAIAgents },
      isLoading: false,
      error: null,
    });

    render(
      <ScreenshotFrame width={1280}>
        <AIAgentsListPage />
      </ScreenshotFrame>
    );

    await expect.element(page.getByText('Customer Support Agent')).toBeVisible();
    await expect.element(page.getByText('Release Notes Writer')).toBeVisible();
    await expect.element(page.getByText('Issue Triage Agent')).toBeVisible();
    // Toolbar + pagination confirm the full table chrome is rendered.
    await expect.element(page.getByPlaceholder('Filter agents...')).toBeVisible();
    await expect.element(page.getByText('Page 1 of 1')).toBeVisible();

    await expect(page.getByTestId('screenshot-frame')).toMatchScreenshot('ai-agent-list-populated');
  });
});
