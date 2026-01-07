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
import userEvent from '@testing-library/user-event';
import {
  AIAgent_State,
  AIAgentSchema,
  DeleteAIAgentRequestSchema,
  DeleteAIAgentResponseSchema,
  ListAIAgentsResponseSchema,
  StartAIAgentRequestSchema,
  StartAIAgentResponseSchema,
  StopAIAgentRequestSchema,
  StopAIAgentResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import {
  deleteAIAgent,
  listAIAgents,
  startAIAgent,
  stopAIAgent,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { ListMCPServersResponseSchema, MCPServerSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { listMCPServers } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp-MCPServerService_connectquery';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
}));

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

global.ResizeObserver = class ResizeObserver {
  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
  disconnect() {
    // Mock implementation
  }
};

Element.prototype.scrollIntoView = vi.fn();

import { AIAgentsListPage } from './ai-agent-list-page';

const OPEN_MENU_REGEX = /open menu/i;
const DELETE_CONFIRMATION_REGEX = /you are about to delete/i;
const TYPE_DELETE_REGEX = /type "delete" to confirm/i;
const DELETE_BUTTON_REGEX = /^delete$/i;
const LOADING_AGENTS_REGEX = /loading ai agents/i;

describe('AIAgentsListPage', () => {
  test('should list all AI agents', async () => {
    const agent1 = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Test Agent 1',
      description: 'Description 1',
      state: AIAgent_State.RUNNING,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-1',
          },
        },
      },
      model: 'gpt-4',
      systemPrompt: 'You are helpful',
      mcpServers: {
        server1: { id: 'server-1' },
      },
      tags: {},
    });

    const agent2 = create(AIAgentSchema, {
      id: 'agent-2',
      displayName: 'Test Agent 2',
      description: 'Description 2',
      state: AIAgent_State.STOPPED,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-2',
          },
        },
      },
      model: 'gpt-3.5-turbo',
      systemPrompt: 'You are helpful too',
      mcpServers: {
        server2: { id: 'server-2' },
      },
      tags: {},
    });

    const mcpServer1 = create(MCPServerSchema, {
      id: 'server-1',
      displayName: 'Test MCP Server 1',
      tools: {
        'tool-1': {
          componentType: 1,
          configYaml: 'test: config',
        },
      },
    });

    const mcpServer2 = create(MCPServerSchema, {
      id: 'server-2',
      displayName: 'Test MCP Server 2',
      tools: {
        'tool-2': {
          componentType: 2,
          configYaml: 'test: config2',
        },
      },
    });

    const listAIAgentsResponse = create(ListAIAgentsResponseSchema, {
      aiAgents: [agent1, agent2],
      nextPageToken: '',
    });

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [mcpServer1, mcpServer2],
      nextPageToken: '',
    });

    const listAIAgentsMock = vi.fn().mockReturnValue(listAIAgentsResponse);
    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, listAIAgentsMock);
      rpc(listMCPServers, listMCPServersMock);
    });

    render(
      <MemoryRouter>
        <AIAgentsListPage />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Agent 1')).toBeVisible();
      expect(screen.getByText('Test Agent 2')).toBeVisible();
    });

    expect(listAIAgentsMock).toHaveBeenCalledTimes(1);
    expect(listMCPServersMock).toHaveBeenCalledTimes(1);

    expect(screen.getByText('tool-1')).toBeVisible();
    expect(screen.getByText('tool-2')).toBeVisible();

    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.getByText('Stopped')).toBeVisible();

    expect(screen.getByText('gpt-4')).toBeVisible();
    expect(screen.getByText('gpt-3.5-turbo')).toBeVisible();
  });

  test('should delete an AI agent from the list', async () => {
    const user = userEvent.setup();

    const agent1 = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Test Agent 1',
      description: 'Description 1',
      state: AIAgent_State.RUNNING,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-1',
          },
        },
      },
      model: 'gpt-4',
      systemPrompt: 'You are helpful',
      mcpServers: {},
      tags: {},
    });

    const listAIAgentsResponse = create(ListAIAgentsResponseSchema, {
      aiAgents: [agent1],
      nextPageToken: '',
    });

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [],
      nextPageToken: '',
    });

    const listAIAgentsMock = vi.fn().mockReturnValue(listAIAgentsResponse);
    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);
    const deleteAIAgentMock = vi.fn().mockReturnValue(create(DeleteAIAgentResponseSchema, {}));

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, listAIAgentsMock);
      rpc(listMCPServers, listMCPServersMock);
      rpc(deleteAIAgent, deleteAIAgentMock);
    });

    render(
      <MemoryRouter>
        <AIAgentsListPage />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Agent 1')).toBeVisible();
    });

    const rows = screen.getAllByRole('row');
    const agentRow = rows.find((row) => within(row).queryByText('Test Agent 1'));
    expect(agentRow).toBeDefined();

    if (!agentRow) {
      throw new Error('Agent row not found');
    }

    const actionsButton = within(agentRow).getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const deleteButton = await screen.findByText('Delete', {}, { timeout: 3000 });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(DELETE_CONFIRMATION_REGEX)).toBeVisible();
    });

    const confirmationInput = screen.getByPlaceholderText(TYPE_DELETE_REGEX);
    await user.type(confirmationInput, 'delete');

    const confirmButton = screen.getByRole('button', { name: DELETE_BUTTON_REGEX });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(deleteAIAgentMock).toHaveBeenCalledTimes(1);
      expect(deleteAIAgentMock).toHaveBeenCalledWith(
        create(DeleteAIAgentRequestSchema, {
          id: 'agent-1',
        }),
        expect.anything()
      );
    });
  });

  test('should stop a running AI agent from the list', async () => {
    const user = userEvent.setup();

    const agent1 = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Test Agent 1',
      description: 'Description 1',
      state: AIAgent_State.RUNNING,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-1',
          },
        },
      },
      model: 'gpt-4',
      systemPrompt: 'You are helpful',
      mcpServers: {},
      tags: {},
    });

    const listAIAgentsResponse = create(ListAIAgentsResponseSchema, {
      aiAgents: [agent1],
      nextPageToken: '',
    });

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [],
      nextPageToken: '',
    });

    const listAIAgentsMock = vi.fn().mockReturnValue(listAIAgentsResponse);
    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);
    const stopAIAgentMock = vi.fn().mockReturnValue(
      create(StopAIAgentResponseSchema, {
        aiAgent: create(AIAgentSchema, {
          ...agent1,
          state: AIAgent_State.STOPPED,
        }),
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, listAIAgentsMock);
      rpc(listMCPServers, listMCPServersMock);
      rpc(stopAIAgent, stopAIAgentMock);
    });

    render(
      <MemoryRouter>
        <AIAgentsListPage />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Agent 1')).toBeVisible();
      expect(screen.getByText('Running')).toBeVisible();
    });

    const rows = screen.getAllByRole('row');
    const agentRow = rows.find((row) => within(row).queryByText('Test Agent 1'));
    expect(agentRow).toBeDefined();

    if (!agentRow) {
      throw new Error('Agent row not found');
    }

    const actionsButton = within(agentRow).getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const stopMenuItem = await screen.findByText('Stop Agent', {}, { timeout: 3000 });
    await user.click(stopMenuItem);

    await waitFor(() => {
      expect(stopAIAgentMock).toHaveBeenCalledTimes(1);
      expect(stopAIAgentMock).toHaveBeenCalledWith(
        create(StopAIAgentRequestSchema, {
          id: 'agent-1',
        }),
        expect.anything()
      );
    });
  });

  test('should start a stopped AI agent from the list', async () => {
    const user = userEvent.setup();

    const agent1 = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Test Agent 1',
      description: 'Description 1',
      state: AIAgent_State.STOPPED,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-1',
          },
        },
      },
      model: 'gpt-4',
      systemPrompt: 'You are helpful',
      mcpServers: {},
      tags: {},
    });

    const listAIAgentsResponse = create(ListAIAgentsResponseSchema, {
      aiAgents: [agent1],
      nextPageToken: '',
    });

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [],
      nextPageToken: '',
    });

    const listAIAgentsMock = vi.fn().mockReturnValue(listAIAgentsResponse);
    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);
    const startAIAgentMock = vi.fn().mockReturnValue(
      create(StartAIAgentResponseSchema, {
        aiAgent: create(AIAgentSchema, {
          ...agent1,
          state: AIAgent_State.RUNNING,
        }),
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, listAIAgentsMock);
      rpc(listMCPServers, listMCPServersMock);
      rpc(startAIAgent, startAIAgentMock);
    });

    render(
      <MemoryRouter>
        <AIAgentsListPage />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Agent 1')).toBeVisible();
      expect(screen.getByText('Stopped')).toBeVisible();
    });

    const rows = screen.getAllByRole('row');
    const agentRow = rows.find((row) => within(row).queryByText('Test Agent 1'));
    expect(agentRow).toBeDefined();

    if (!agentRow) {
      throw new Error('Agent row not found');
    }

    const actionsButton = within(agentRow).getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const startMenuItem = await screen.findByText('Start Agent', {}, { timeout: 3000 });
    await user.click(startMenuItem);

    await waitFor(() => {
      expect(startAIAgentMock).toHaveBeenCalledTimes(1);
      expect(startAIAgentMock).toHaveBeenCalledWith(
        create(StartAIAgentRequestSchema, {
          id: 'agent-1',
        }),
        expect.anything()
      );
    });
  });

  test('should display loading state when fetching agents', async () => {
    const listAIAgentsMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              create(ListAIAgentsResponseSchema, {
                aiAgents: [],
                nextPageToken: '',
              })
            );
          }, 100);
        })
    );

    const listMCPServersMock = vi.fn().mockReturnValue(
      create(ListMCPServersResponseSchema, {
        mcpServers: [],
        nextPageToken: '',
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, listAIAgentsMock);
      rpc(listMCPServers, listMCPServersMock);
    });

    render(
      <MemoryRouter>
        <AIAgentsListPage />
      </MemoryRouter>,
      { transport }
    );

    expect(screen.getByText(LOADING_AGENTS_REGEX)).toBeVisible();

    await waitFor(() => {
      expect(screen.queryByText(LOADING_AGENTS_REGEX)).not.toBeInTheDocument();
    });
  });

  test('should display empty state when no agents exist', async () => {
    const listAIAgentsResponse = create(ListAIAgentsResponseSchema, {
      aiAgents: [],
      nextPageToken: '',
    });

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [],
      nextPageToken: '',
    });

    const listAIAgentsMock = vi.fn().mockReturnValue(listAIAgentsResponse);
    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, listAIAgentsMock);
      rpc(listMCPServers, listMCPServersMock);
    });

    render(
      <MemoryRouter>
        <AIAgentsListPage />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('No AI agents found.')).toBeVisible();
    });
  });

  test('should filter agents by name', async () => {
    const user = userEvent.setup();

    const agent1 = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Alpha Agent',
      description: 'Description 1',
      state: AIAgent_State.RUNNING,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-1',
          },
        },
      },
      model: 'gpt-4',
      systemPrompt: 'You are helpful',
      mcpServers: {},
      tags: {},
    });

    const agent2 = create(AIAgentSchema, {
      id: 'agent-2',
      displayName: 'Beta Agent',
      description: 'Description 2',
      state: AIAgent_State.STOPPED,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-2',
          },
        },
      },
      model: 'gpt-3.5-turbo',
      systemPrompt: 'You are helpful too',
      mcpServers: {},
      tags: {},
    });

    const listAIAgentsResponse = create(ListAIAgentsResponseSchema, {
      aiAgents: [agent1, agent2],
      nextPageToken: '',
    });

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [],
      nextPageToken: '',
    });

    const listAIAgentsMock = vi.fn().mockReturnValue(listAIAgentsResponse);
    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listAIAgents, listAIAgentsMock);
      rpc(listMCPServers, listMCPServersMock);
    });

    render(
      <MemoryRouter>
        <AIAgentsListPage />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('Alpha Agent')).toBeVisible();
      expect(screen.getByText('Beta Agent')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter agents...');
    await user.type(filterInput, 'Alpha');

    await waitFor(() => {
      expect(screen.getByText('Alpha Agent')).toBeVisible();
      expect(screen.queryByText('Beta Agent')).not.toBeInTheDocument();
    });
  });
});
