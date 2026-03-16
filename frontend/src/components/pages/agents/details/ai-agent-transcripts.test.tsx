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
import { durationFromMs, timestampFromMs } from '@bufbuild/protobuf/wkt';
import { createRouterTransport } from '@connectrpc/connect';
import {
  AIAgent_State,
  AIAgentSchema,
  AIAgentTranscriptSchema,
  AIAgentTranscriptStatus,
  AIAgentTranscriptSummarySchema,
  AIAgentTranscriptTurnRole,
  GetAIAgentResponseSchema,
  GetAIAgentTranscriptResponseSchema,
  ListAIAgentTranscriptsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import {
  getAIAgent,
  getAIAgentTranscript,
  listAIAgentTranscripts,
} from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { fireEvent, render, screen, waitFor } from 'test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const AGENT_ID = 'agent-1';
const TRANSCRIPT_ID = 'conv_001';
const navigateMock = vi.fn();

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  const search = { tab: 'transcripts' };
  return {
    ...actual,
    getRouteApi: () => ({
      useParams: () => ({ id: AGENT_ID, transcriptId: TRANSCRIPT_ID }),
      useSearch: (options?: { select?: (value: typeof search) => unknown }) =>
        options?.select ? options.select(search) : search,
    }),
    useNavigate: () => navigateMock,
  };
});

import { AIAgentTranscriptDetailsPage } from './ai-agent-transcript-details-page';
import { AIAgentTranscriptsTab } from './ai-agent-transcripts-tab';

const createAgent = () =>
  create(AIAgentSchema, {
    id: AGENT_ID,
    displayName: 'Support Ticket Classifier',
    description: 'Classifies inbound support tickets',
    state: AIAgent_State.RUNNING,
    provider: {
      provider: {
        case: 'openai',
        value: {
          apiKey: String.raw`\${secrets.OPENAI_API_KEY}`,
        },
      },
    },
    model: 'gpt-4o',
    systemPrompt: 'You are a support ticket classifier.',
    mcpServers: {},
    subagents: {},
    tags: {},
  });

const createSummary = () =>
  create(AIAgentTranscriptSummarySchema, {
    transcriptId: TRANSCRIPT_ID,
    agentId: AGENT_ID,
    title: 'Billing issue classification',
    startTime: timestampFromMs(Date.now() - 5 * 60 * 1000),
    endTime: timestampFromMs(Date.now() - 5 * 60 * 1000 + 87 * 1000),
    duration: durationFromMs(87 * 1000),
    status: AIAgentTranscriptStatus.AI_AGENT_TRANSCRIPT_STATUS_COMPLETED,
    turnCount: 3,
    usage: {
      inputTokens: 596n,
      outputTokens: 544n,
      totalTokens: 1140n,
      estimatedCostUsd: 0.12,
    },
    userId: 'user_abc123',
    traceId: 'trace_001',
  });

const createTranscript = () =>
  create(AIAgentTranscriptSchema, {
    summary: createSummary(),
    systemPrompt: 'You are a support ticket classifier.',
    turns: [
      {
        turnId: 'turn-1',
        role: AIAgentTranscriptTurnRole.AI_AGENT_TRANSCRIPT_TURN_ROLE_USER,
        timestamp: timestampFromMs(Date.now() - 5 * 60 * 1000),
        content: 'Customer complaint about billing issue with invoice #45892.',
      },
      {
        turnId: 'turn-2',
        role: AIAgentTranscriptTurnRole.AI_AGENT_TRANSCRIPT_TURN_ROLE_ASSISTANT,
        timestamp: timestampFromMs(Date.now() - 5 * 60 * 1000 + 2000),
        content: '{ "category": "billing", "priority": "high" }',
        model: 'gpt-4o',
        latency: durationFromMs(800),
        usage: {
          inputTokens: 284n,
          outputTokens: 544n,
          totalTokens: 828n,
          estimatedCostUsd: 0.08,
        },
      },
    ],
  });

const createTransport = () =>
  createRouterTransport(({ rpc }) => {
    rpc(getAIAgent, () =>
      create(GetAIAgentResponseSchema, {
        aiAgent: createAgent(),
      })
    );

    rpc(listAIAgentTranscripts, () =>
      create(ListAIAgentTranscriptsResponseSchema, {
        transcripts: [createSummary()],
        nextPageToken: '',
      })
    );

    rpc(getAIAgentTranscript, () =>
      create(GetAIAgentTranscriptResponseSchema, {
        transcript: createTranscript(),
      })
    );
  });

describe('agent transcripts UI', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  test('renders the transcripts tab and navigates to transcript details', async () => {
    render(<AIAgentTranscriptsTab />, { transport: createTransport() });

    await waitFor(() => {
      expect(screen.getByText('Agent transcripts')).toBeVisible();
      expect(screen.getByText('Billing issue classification')).toBeVisible();
    });

    fireEvent.click(screen.getByText(TRANSCRIPT_ID));

    expect(navigateMock).toHaveBeenCalledWith({
      params: { id: AGENT_ID, transcriptId: TRANSCRIPT_ID },
      to: '/agents/$id/transcripts/$transcriptId',
    });
  });

  test('renders the transcript details page', async () => {
    render(<AIAgentTranscriptDetailsPage />, { transport: createTransport() });

    await waitFor(() => {
      expect(screen.getByText('Billing issue classification')).toBeVisible();
      expect(screen.getByText('Support Ticket Classifier')).toBeVisible();
      expect(screen.getByText('Back to transcripts')).toBeVisible();
      expect(screen.getByText('System prompt')).toBeVisible();
      expect(screen.getByText('Customer complaint about billing issue with invoice #45892.')).toBeVisible();
    });
  });
});
