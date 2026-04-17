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
import { ListMCPServersResponseSchema, MCPServerSchema } from 'protogen/redpanda/api/adp/v1alpha1/mcp_server_pb';
import { listMCPServers } from 'protogen/redpanda/api/adp/v1alpha1/mcp_server-MCPServerService_connectquery';
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
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    config: {
      jwt: 'test-jwt-token',
      controlplaneUrl: 'http://localhost:9090',
      aigwUrl: 'http://localhost:9091',
    },
    isFeatureFlagEnabled: vi.fn(() => false),
    addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
    isEmbedded: vi.fn(() => false),
  };
});

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Route aigw queries through the same test transport as the main dataplane transport
vi.mock('hooks/use-aigw-transport', async () => {
  const { useTransport } = await import('@connectrpc/connect-query');
  return {
    useAigwTransport: () => useTransport(),
  };
});

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

const createAIAgentsTransport = (options: {
  listAIAgentsMock: ReturnType<typeof vi.fn>;
  listMCPServersMock?: ReturnType<typeof vi.fn>;
  deleteAIAgentMock?: ReturnType<typeof vi.fn>;
  startAIAgentMock?: ReturnType<typeof vi.fn>;
  stopAIAgentMock?: ReturnType<typeof vi.fn>;
}) =>
  createRouterTransport(({ rpc }) => {
    rpc(listAIAgents, options.listAIAgentsMock);
    rpc(
      listMCPServers,
      options.listMCPServersMock ?? vi.fn().mockReturnValue(create(ListMCPServersResponseSchema, {}))
    );
    if (options.deleteAIAgentMock) {
      rpc(deleteAIAgent, options.deleteAIAgentMock);
    }
    if (options.startAIAgentMock) {
      rpc(startAIAgent, options.startAIAgentMock);
    }
    if (options.stopAIAgentMock) {
      rpc(stopAIAgent, options.stopAIAgentMock);
    }
  });

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
      name: 'server-1',
      tools: [{ name: 'tool-1', description: '', inputSchema: '' }],
    });

    const mcpServer2 = create(MCPServerSchema, {
      name: 'server-2',
      tools: [{ name: 'tool-2', description: '', inputSchema: '' }],
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

    const transport = createAIAgentsTransport({ listAIAgentsMock, listMCPServersMock });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

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

    const transport = createAIAgentsTransport({ listAIAgentsMock, listMCPServersMock, deleteAIAgentMock });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

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

    const transport = createAIAgentsTransport({ listAIAgentsMock, listMCPServersMock, stopAIAgentMock });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

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

    const transport = createAIAgentsTransport({ listAIAgentsMock, listMCPServersMock, startAIAgentMock });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

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

    const transport = createAIAgentsTransport({ listAIAgentsMock, listMCPServersMock });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

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

    const transport = createAIAgentsTransport({ listAIAgentsMock, listMCPServersMock });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

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

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

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

  test('should update pagination footer and disable next button on the last page', async () => {
    const user = userEvent.setup();
    const aiAgents = Array.from({ length: 25 }, (_, index) =>
      create(AIAgentSchema, {
        id: `agent-${index + 1}`,
        displayName: `Test Agent ${index + 1}`,
        description: `Description ${index + 1}`,
        state: AIAgent_State.RUNNING,
        provider: {
          provider: {
            case: 'openai',
            value: {
              apiKey: `secret-${index + 1}`,
            },
          },
        },
        model: 'gpt-4',
        systemPrompt: 'You are helpful',
        mcpServers: {},
        tags: {},
      })
    );

    const listAIAgentsResponse = create(ListAIAgentsResponseSchema, {
      aiAgents,
      nextPageToken: '',
    });

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [],
      nextPageToken: '',
    });

    const listAIAgentsMock = vi.fn().mockReturnValue(listAIAgentsResponse);
    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);
    const transport = createAIAgentsTransport({ listAIAgentsMock, listMCPServersMock });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeVisible();
    });

    const previousButton = screen.getByRole('button', { name: 'Go to previous page' });
    const nextButton = screen.getByRole('button', { name: 'Go to next page' });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 3')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));

    await waitFor(() => {
      expect(screen.getByText('Page 3 of 3')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  });

  test('search input updates value on keystrokes', async () => {
    const user = userEvent.setup();

    const agent1 = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Test Agent',
      description: '',
      state: AIAgent_State.RUNNING,
      provider: { provider: { case: 'openai', value: { apiKey: 'key' } } },
      model: 'gpt-4',
      systemPrompt: '',
      mcpServers: {},
      tags: {},
    });

    const transport = createAIAgentsTransport({
      listAIAgentsMock: vi
        .fn()
        .mockReturnValue(create(ListAIAgentsResponseSchema, { aiAgents: [agent1], nextPageToken: '' })),
    });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Agent')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter agents...');
    await user.type(filterInput, 'hello');

    // Input value must reflect typed text — a React Compiler memoization
    // bug would freeze it at the initial empty string.
    expect(filterInput).toHaveValue('hello');
  });

  test('filters agents by name via search input', async () => {
    const user = userEvent.setup();

    const agent1 = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Alpha Agent',
      description: '',
      state: AIAgent_State.RUNNING,
      provider: { provider: { case: 'openai', value: { apiKey: 'key' } } },
      model: 'gpt-4',
      systemPrompt: '',
      mcpServers: {},
      tags: {},
    });

    const agent2 = create(AIAgentSchema, {
      id: 'agent-2',
      displayName: 'Beta Agent',
      description: '',
      state: AIAgent_State.STOPPED,
      provider: { provider: { case: 'openai', value: { apiKey: 'key' } } },
      model: 'gpt-4',
      systemPrompt: '',
      mcpServers: {},
      tags: {},
    });

    const transport = createAIAgentsTransport({
      listAIAgentsMock: vi
        .fn()
        .mockReturnValue(create(ListAIAgentsResponseSchema, { aiAgents: [agent1, agent2], nextPageToken: '' })),
    });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Alpha Agent')).toBeVisible();
      expect(screen.getByText('Beta Agent')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter agents...');
    await user.type(filterInput, 'Beta');

    await waitFor(() => {
      expect(screen.getByText('Beta Agent')).toBeVisible();
      expect(screen.queryByText('Alpha Agent')).not.toBeInTheDocument();
    });

    // Clear and type again to verify the input remains interactive
    await user.clear(filterInput);

    await waitFor(() => {
      expect(screen.getByText('Alpha Agent')).toBeVisible();
      expect(screen.getByText('Beta Agent')).toBeVisible();
    });
  });

  test('status faceted filter filters results', async () => {
    const user = userEvent.setup();

    const agent1 = create(AIAgentSchema, {
      id: 'agent-1',
      displayName: 'Running Agent',
      description: '',
      state: AIAgent_State.RUNNING,
      provider: { provider: { case: 'openai', value: { apiKey: 'key' } } },
      model: 'gpt-4',
      systemPrompt: '',
      mcpServers: {},
      tags: {},
    });

    const agent2 = create(AIAgentSchema, {
      id: 'agent-2',
      displayName: 'Stopped Agent',
      description: '',
      state: AIAgent_State.STOPPED,
      provider: { provider: { case: 'openai', value: { apiKey: 'key' } } },
      model: 'gpt-4',
      systemPrompt: '',
      mcpServers: {},
      tags: {},
    });

    const transport = createAIAgentsTransport({
      listAIAgentsMock: vi
        .fn()
        .mockReturnValue(create(ListAIAgentsResponseSchema, { aiAgents: [agent1, agent2], nextPageToken: '' })),
    });

    renderWithFileRoutes(<AIAgentsListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Running Agent')).toBeVisible();
      expect(screen.getByText('Stopped Agent')).toBeVisible();
    });

    // Click the "Status" faceted filter button (not the column header one in <thead>)
    const statusFilterButton = screen.getAllByRole('button', { name: /status/i }).find((btn) => !btn.closest('thead'))!;
    await user.click(statusFilterButton);

    // Select the "Stopped" option from the filter popover
    const stoppedOption = await screen.findByRole('option', { name: /stopped/i });
    await user.click(stoppedOption);

    // Only the stopped agent should remain visible
    await waitFor(() => {
      expect(screen.getByText('Stopped Agent')).toBeVisible();
      expect(screen.queryByText('Running Agent')).not.toBeInTheDocument();
    });
  });
});
