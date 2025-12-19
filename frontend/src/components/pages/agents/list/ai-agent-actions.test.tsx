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
import { CLOUD_MANAGED_TAG_KEYS } from 'components/constants';
import {
  AIAgent_State,
  AIAgentSchema,
  StartAIAgentRequestSchema,
  StartAIAgentResponseSchema,
  StopAIAgentRequestSchema,
  StopAIAgentResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import {
  startAIAgent,
  stopAIAgent,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { render, screen, waitFor } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { AIAgentActions } from './ai-agent-actions';
import type { AIAgent } from './ai-agent-list-page';

const OPEN_MENU_REGEX = /open menu/i;
const DELETE_CONFIRMATION_REGEX = /you are about to delete/i;
const TYPE_DELETE_REGEX = /type "delete" to confirm/i;
const DELETE_BUTTON_REGEX = /^delete$/i;

describe('AIAgentActions', () => {
  const onDeleteWithServiceAccount = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const mockClipboard = {
      writeText: vi.fn(() => Promise.resolve()),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
      configurable: true,
    });
  });

  test('should render dropdown menu with all actions for a stopped agent', async () => {
    const user = userEvent.setup();

    const agent: AIAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'Test Description',
      state: AIAgent_State.STOPPED,
      model: 'gpt-4',
      providerType: 'openai',
      url: 'http://localhost:8080/agents/agent-1',
      mcpServers: {},
      tags: {},
    };

    render(
      <AIAgentActions agent={agent} isDeletingAgent={false} onDeleteWithServiceAccount={onDeleteWithServiceAccount} />
    );

    const actionsButton = screen.getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    await waitFor(() => {
      expect(screen.getByText('Copy URL')).toBeInTheDocument();
      expect(screen.getByText('Start Agent')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
    expect(screen.queryByText('Stop Agent')).not.toBeInTheDocument();
  });

  test('should render dropdown menu with all actions for a running agent', async () => {
    const user = userEvent.setup();

    const agent: AIAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'Test Description',
      state: AIAgent_State.RUNNING,
      model: 'gpt-4',
      providerType: 'openai',
      url: 'http://localhost:8080/agents/agent-1',
      mcpServers: {},
      tags: {},
    };

    render(
      <AIAgentActions agent={agent} isDeletingAgent={false} onDeleteWithServiceAccount={onDeleteWithServiceAccount} />
    );

    const actionsButton = screen.getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    await waitFor(() => {
      expect(screen.getByText('Copy URL')).toBeInTheDocument();
      expect(screen.getByText('Stop Agent')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
    expect(screen.queryByText('Start Agent')).not.toBeInTheDocument();
  });

  test('should start a stopped agent', async () => {
    const user = userEvent.setup();

    const agent: AIAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'Test Description',
      state: AIAgent_State.STOPPED,
      model: 'gpt-4',
      providerType: 'openai',
      url: 'http://localhost:8080/agents/agent-1',
      mcpServers: {},
      tags: {},
    };

    const startAIAgentMock = vi.fn().mockReturnValue(
      create(StartAIAgentResponseSchema, {
        aiAgent: create(AIAgentSchema, {
          ...agent,
          state: AIAgent_State.RUNNING,
        }),
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(startAIAgent, startAIAgentMock);
    });

    render(
      <AIAgentActions agent={agent} isDeletingAgent={false} onDeleteWithServiceAccount={onDeleteWithServiceAccount} />,
      { transport }
    );

    const actionsButton = screen.getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const startMenuItem = screen.getByText('Start Agent');
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

  test('should stop a running agent', async () => {
    const user = userEvent.setup();

    const agent: AIAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'Test Description',
      state: AIAgent_State.RUNNING,
      model: 'gpt-4',
      providerType: 'openai',
      url: 'http://localhost:8080/agents/agent-1',
      mcpServers: {},
      tags: {},
    };

    const stopAIAgentMock = vi.fn().mockReturnValue(
      create(StopAIAgentResponseSchema, {
        aiAgent: create(AIAgentSchema, {
          ...agent,
          state: AIAgent_State.STOPPED,
        }),
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(stopAIAgent, stopAIAgentMock);
    });

    render(
      <AIAgentActions agent={agent} isDeletingAgent={false} onDeleteWithServiceAccount={onDeleteWithServiceAccount} />,
      { transport }
    );

    const actionsButton = screen.getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const stopMenuItem = screen.getByText('Stop Agent');
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

  test('should display copy URL menu item when agent has URL', async () => {
    const user = userEvent.setup();

    const agent: AIAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'Test Description',
      state: AIAgent_State.RUNNING,
      model: 'gpt-4',
      providerType: 'openai',
      url: 'http://localhost:8080/agents/agent-1',
      mcpServers: {},
      tags: {},
    };

    render(
      <AIAgentActions agent={agent} isDeletingAgent={false} onDeleteWithServiceAccount={onDeleteWithServiceAccount} />
    );

    const actionsButton = screen.getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    await waitFor(() => {
      expect(screen.getByText('Copy URL')).toBeInTheDocument();
    });
  });

  test('should delete agent without service account cleanup', async () => {
    const user = userEvent.setup();

    const agent: AIAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'Test Description',
      state: AIAgent_State.STOPPED,
      model: 'gpt-4',
      providerType: 'openai',
      url: 'http://localhost:8080/agents/agent-1',
      mcpServers: {},
      tags: {},
    };

    onDeleteWithServiceAccount.mockResolvedValue(undefined);

    render(
      <AIAgentActions agent={agent} isDeletingAgent={false} onDeleteWithServiceAccount={onDeleteWithServiceAccount} />
    );

    const actionsButton = screen.getByRole('button', { name: OPEN_MENU_REGEX });
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
      expect(onDeleteWithServiceAccount).toHaveBeenCalledTimes(1);
      expect(onDeleteWithServiceAccount).toHaveBeenCalledWith('agent-1', false, null, null);
    });
  });

  test('should delete agent with service account cleanup', async () => {
    const user = userEvent.setup();

    const agent: AIAgent = {
      id: 'agent-1',
      name: 'Test Agent',
      description: 'Test Description',
      state: AIAgent_State.STOPPED,
      model: 'gpt-4',
      providerType: 'openai',
      url: 'http://localhost:8080/agents/agent-1',
      mcpServers: {},
      tags: {
        [CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID]: 'sa-123',
        [CLOUD_MANAGED_TAG_KEYS.SECRET_ID]: 'test-secret',
      },
    };

    onDeleteWithServiceAccount.mockResolvedValue(undefined);

    render(
      <AIAgentActions agent={agent} isDeletingAgent={false} onDeleteWithServiceAccount={onDeleteWithServiceAccount} />
    );

    const actionsButton = screen.getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const deleteButton = await screen.findByText('Delete', {}, { timeout: 3000 });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(DELETE_CONFIRMATION_REGEX)).toBeVisible();
    });

    const switchElement = screen.getByRole('switch');
    await user.click(switchElement);

    const confirmationInput = screen.getByPlaceholderText(TYPE_DELETE_REGEX);
    await user.type(confirmationInput, 'delete');

    const confirmButton = screen.getByRole('button', { name: DELETE_BUTTON_REGEX });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(onDeleteWithServiceAccount).toHaveBeenCalledTimes(1);
      expect(onDeleteWithServiceAccount).toHaveBeenCalledWith('agent-1', true, 'test-secret', 'sa-123');
    });
  });
});
