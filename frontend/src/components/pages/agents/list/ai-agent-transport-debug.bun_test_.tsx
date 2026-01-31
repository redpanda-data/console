/**
 * Debug test to verify transport mocking works
 */
import { describe, expect, mock, test } from 'bun:test';

// Set up module mocks
mock.module('config', () => ({
  config: { jwt: 'test', controlplaneUrl: 'http://localhost' },
  isFeatureFlagEnabled: () => false,
  addBearerTokenInterceptor: (next: (r: unknown) => Promise<unknown>) => next,
  checkExpiredLicenseInterceptor: (next: (r: unknown) => Promise<unknown>) => next,
  isEmbedded: () => false,
  isServerless: () => false,
  getGrpcBasePath: () => '',
  getControlplaneBasePath: () => '',
  setMonacoTheme: () => {},
  embeddedAvailableRoutesObservable: { value: [] },
  setup: () => {},
}));

mock.module('state/ui-state', () => ({
  uiState: { pageTitle: '', pageBreadcrumbs: [] },
}));

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import {
  AIAgent_State,
  AIAgentSchema,
  ListAIAgentsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { listAIAgents } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { ListMCPServersResponseSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { listMCPServers } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp-MCPServerService_connectquery';
import { renderWithFileRoutes } from 'test-utils';

import { AIAgentsListPage } from './ai-agent-list-page';

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = mock(() => {});

describe('Transport Debug', () => {
  test('should use mocked transport with AIAgentsListPage', async () => {
    const agent = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Test Agent Debug',
      state: AIAgent_State.RUNNING,
      provider: { provider: { case: 'openai', value: { apiKey: 'x' } } },
      model: 'gpt-4',
      mcpServers: {},
      tags: {},
    });

    const listAIAgentsMock = mock(() => {
      console.log('Mock listAIAgents called!');
      return create(ListAIAgentsResponseSchema, { aiAgents: [agent], nextPageToken: '' });
    });

    const listMCPServersMock = mock(() => {
      console.log('Mock listMCPServers called!');
      return create(ListMCPServersResponseSchema, { mcpServers: [], nextPageToken: '' });
    });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, listAIAgentsMock);
      rpc(listMCPServers, listMCPServersMock);
    });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

    // Check initial state
    console.log('Initial HTML (first 500 chars):', document.body.innerHTML.slice(0, 500));

    // Wait a bit for async operations
    await new Promise((r) => setTimeout(r, 1000));

    console.log('After 1000ms HTML (first 1000 chars):', document.body.innerHTML.slice(0, 1000));
    console.log('listAIAgents mock calls:', listAIAgentsMock.mock.calls.length);
    console.log('listMCPServers mock calls:', listMCPServersMock.mock.calls.length);

    // Check if "Test Agent Debug" appears in HTML
    const hasAgentName = document.body.innerHTML.includes('Test Agent Debug');
    console.log('Has agent name in HTML:', hasAgentName);

    expect(listAIAgentsMock).toHaveBeenCalled();
  });
});
