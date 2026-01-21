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
import {
  AIAgent_State,
  AIAgentSchema,
  GetAIAgentRequestSchema,
  GetAIAgentResponseSchema,
  StartAIAgentRequestSchema,
  StartAIAgentResponseSchema,
  StopAIAgentRequestSchema,
  StopAIAgentResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import {
  getAIAgent,
  startAIAgent,
  stopAIAgent,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { fireEvent, renderWithFileRoutes, screen, waitFor } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
}));

const AGENT_ID = 'agent-1';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    getRouteApi: () => ({
      useParams: () => ({ id: AGENT_ID }),
    }),
  };
});

import { AIAgentToggleButton } from './ai-agent-toggle-button';

const START_BUTTON_REGEX = /start/i;

describe('AIAgentToggleButton', () => {
  test('should stop a running AI agent from the details page', async () => {
    const agentId = 'agent-1';
    const agent = create(AIAgentSchema, {
      id: agentId,
      displayName: 'Test Agent 1',
      description: 'Test Description',
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
      systemPrompt: 'You are a helpful assistant',
      mcpServers: {},
    });

    const getAIAgentResponse = create(GetAIAgentResponseSchema, {
      aiAgent: agent,
    });

    const getAIAgentMock = vi.fn().mockReturnValue(getAIAgentResponse);
    const stopAIAgentMock = vi.fn().mockReturnValue(
      create(StopAIAgentResponseSchema, {
        aiAgent: create(AIAgentSchema, {
          ...agent,
          state: AIAgent_State.STOPPED,
        }),
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getAIAgent, getAIAgentMock);
      rpc(stopAIAgent, stopAIAgentMock);
    });

    renderWithFileRoutes(<AIAgentToggleButton />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('stop-ai-agent-button')).toBeVisible();
    });

    expect(getAIAgentMock).toHaveBeenCalledWith(
      create(GetAIAgentRequestSchema, {
        id: agentId,
      }),
      expect.anything()
    );

    const stopButton = screen.getByTestId('stop-ai-agent-button');
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(stopAIAgentMock).toHaveBeenCalledTimes(1);
      expect(stopAIAgentMock).toHaveBeenCalledWith(
        create(StopAIAgentRequestSchema, {
          id: agentId,
        }),
        expect.anything()
      );
    });
  });

  test('should start a stopped AI agent from the details page', async () => {
    const agentId = 'agent-1';
    const agent = create(AIAgentSchema, {
      id: agentId,
      displayName: 'Test Agent 1',
      description: 'Test Description',
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
      systemPrompt: 'You are a helpful assistant',
      mcpServers: {},
    });

    const getAIAgentResponse = create(GetAIAgentResponseSchema, {
      aiAgent: agent,
    });

    const getAIAgentMock = vi.fn().mockReturnValue(getAIAgentResponse);
    const startAIAgentMock = vi.fn().mockReturnValue(
      create(StartAIAgentResponseSchema, {
        aiAgent: create(AIAgentSchema, {
          ...agent,
          state: AIAgent_State.RUNNING,
        }),
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getAIAgent, getAIAgentMock);
      rpc(startAIAgent, startAIAgentMock);
    });

    renderWithFileRoutes(<AIAgentToggleButton />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('start-ai-agent-button')).toBeVisible();
    });

    expect(getAIAgentMock).toHaveBeenCalledWith(
      create(GetAIAgentRequestSchema, {
        id: agentId,
      }),
      expect.anything()
    );

    const startButton = screen.getByTestId('start-ai-agent-button');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(startAIAgentMock).toHaveBeenCalledTimes(1);
      expect(startAIAgentMock).toHaveBeenCalledWith(
        create(StartAIAgentRequestSchema, {
          id: agentId,
        }),
        expect.anything()
      );
    });
  });

  test('should disable stop button while stopping', async () => {
    const agentId = 'agent-1';
    const agent = create(AIAgentSchema, {
      id: agentId,
      displayName: 'Test Agent 1',
      description: 'Test Description',
      state: AIAgent_State.STOPPING,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-1',
          },
        },
      },
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant',
      mcpServers: {},
    });

    const getAIAgentResponse = create(GetAIAgentResponseSchema, {
      aiAgent: agent,
    });

    const getAIAgentMock = vi.fn().mockReturnValue(getAIAgentResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getAIAgent, getAIAgentMock);
    });

    renderWithFileRoutes(<AIAgentToggleButton />, { transport });

    await waitFor(() => {
      const stopButton = screen.getByTestId('stop-ai-agent-button');
      expect(stopButton).toBeVisible();
      expect(stopButton).toBeDisabled();
    });
  });

  test('should disable start button while starting', async () => {
    const agentId = 'agent-1';
    const agent = create(AIAgentSchema, {
      id: agentId,
      displayName: 'Test Agent 1',
      description: 'Test Description',
      state: AIAgent_State.STARTING,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-1',
          },
        },
      },
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant',
      mcpServers: {},
    });

    const getAIAgentResponse = create(GetAIAgentResponseSchema, {
      aiAgent: agent,
    });

    const getAIAgentMock = vi.fn().mockReturnValue(getAIAgentResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getAIAgent, getAIAgentMock);
    });

    renderWithFileRoutes(<AIAgentToggleButton />, { transport });

    await waitFor(() => {
      const startButton = screen.getByRole('button', { name: START_BUTTON_REGEX });
      expect(startButton).toBeVisible();
      expect(startButton).toBeDisabled();
    });
  });

  test('should show start button for agents in error state', async () => {
    const agentId = 'agent-1';
    const agent = create(AIAgentSchema, {
      id: agentId,
      displayName: 'Test Agent 1',
      description: 'Test Description',
      state: AIAgent_State.ERROR,
      provider: {
        provider: {
          case: 'openai',
          value: {
            apiKey: 'secret-1',
          },
        },
      },
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant',
      mcpServers: {},
    });

    const getAIAgentResponse = create(GetAIAgentResponseSchema, {
      aiAgent: agent,
    });

    const getAIAgentMock = vi.fn().mockReturnValue(getAIAgentResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getAIAgent, getAIAgentMock);
    });

    renderWithFileRoutes(<AIAgentToggleButton />, { transport });

    await waitFor(() => {
      const startButton = screen.getByRole('button', { name: START_BUTTON_REGEX });
      expect(startButton).toBeVisible();
      expect(startButton).toBeEnabled();
    });
  });
});
