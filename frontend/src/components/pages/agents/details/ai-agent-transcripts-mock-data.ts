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
import {
  type GetTranscriptResponse,
  GetTranscriptResponseSchema,
  TranscriptStatus,
  type TranscriptSummary,
  TranscriptSummarySchema,
  TranscriptToolCallStatus,
  TranscriptTurnRole,
} from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import type { MessageInit } from 'react-query/react-query.utils';

const now = Date.now();
const MOCK_AGENT_TRANSCRIPTS_STORAGE_KEY = 'redpanda.console.mockAgentTranscripts';

const usage = (inputTokens: number, outputTokens: number, totalTokens: number, estimatedCostUsd: number) => ({
  inputTokens: BigInt(inputTokens),
  outputTokens: BigInt(outputTokens),
  totalTokens: BigInt(totalTokens),
  estimatedCostUsd,
});

const summaries = [
  {
    conversationId: 'conv_001',
    title: 'Billing issue classification',
    offsetMs: 5 * 60 * 1000,
    durationMs: 87 * 1000,
    status: TranscriptStatus.COMPLETED,
    turnCount: 3,
    usage: usage(596, 544, 1140, 0.12),
    userId: 'user_abc123',
    hasErrors: false,
  },
  {
    conversationId: 'conv_002',
    title: 'Password reset triage',
    offsetMs: 27 * 60 * 1000,
    durationMs: 26 * 1000,
    status: TranscriptStatus.COMPLETED,
    turnCount: 2,
    usage: usage(208, 312, 520, 0.04),
    userId: 'user_def456',
    hasErrors: false,
  },
  {
    conversationId: 'conv_003',
    title: 'Long context failure',
    offsetMs: 71 * 60 * 1000,
    durationMs: 40 * 1000,
    status: TranscriptStatus.ERROR,
    turnCount: 2,
    usage: usage(1205, 0, 1205, 0.06),
    userId: 'user_ghi789',
    hasErrors: true,
  },
] as const;

const buildSummary = (agentId: string, summary: (typeof summaries)[number]): TranscriptSummary => {
  const startMs = now - summary.offsetMs;
  const endMs = startMs + summary.durationMs;

  const init = {
    agentId,
    conversationId: summary.conversationId,
    title: summary.title,
    startTime: timestampFromMs(startMs),
    endTime: timestampFromMs(endMs),
    duration: durationFromMs(summary.durationMs),
    status: summary.status,
    turnCount: summary.turnCount,
    usage: summary.usage,
    userId: summary.userId,
    hasErrors: summary.hasErrors,
  } satisfies MessageInit<TranscriptSummary>;

  return create(TranscriptSummarySchema, init);
};

export const getMockAIAgentTranscriptSummaries = (agentId: string): TranscriptSummary[] =>
  summaries.map((summary) => buildSummary(agentId, summary));

export const getMockAIAgentTranscript = (agentId: string, transcriptId: string): GetTranscriptResponse | null => {
  const summary = getMockAIAgentTranscriptSummaries(agentId).find((item) => item.conversationId === transcriptId);

  if (!summary) {
    return null;
  }

  if (transcriptId === 'conv_001') {
    const init = {
      summary,
      systemPrompt:
        'You are a support ticket classification agent. Categorize the ticket, estimate urgency, and suggest the next action.',
      turns: [
        {
          turnId: 'turn_001_1',
          role: TranscriptTurnRole.USER,
          timestamp: timestampFromMs(now - 5 * 60 * 1000),
          content:
            'Customer complaint about billing issue with invoice #45892. They claim they were double charged and want an immediate refund.',
        },
        {
          turnId: 'turn_001_2',
          role: TranscriptTurnRole.ASSISTANT,
          timestamp: timestampFromMs(now - 5 * 60 * 1000 + 2 * 1000),
          content: '',
          model: 'gpt-4o',
          latency: durationFromMs(800),
          usage: usage(284, 0, 284, 0.03),
          toolCalls: [
            {
              toolCallId: 'tool_001_1',
              name: 'analyze_sentiment',
              status: TranscriptToolCallStatus.COMPLETED,
              latency: durationFromMs(120),
              output: '{"sentiment":"negative","confidence":0.97}',
            },
            {
              toolCallId: 'tool_001_2',
              name: 'categorize_ticket',
              status: TranscriptToolCallStatus.COMPLETED,
              latency: durationFromMs(95),
              output: '{"category":"billing","priority":"high"}',
            },
          ],
        },
        {
          turnId: 'turn_001_3',
          role: TranscriptTurnRole.ASSISTANT,
          timestamp: timestampFromMs(now - 5 * 60 * 1000 + 4 * 1000),
          content:
            '{\n  "category": "billing",\n  "priority": "high",\n  "sentiment": "negative",\n  "confidence": 0.94,\n  "suggested_action": "escalate_to_billing_team"\n}',
          model: 'gpt-4o',
          latency: durationFromMs(1200),
          usage: usage(312, 544, 856, 0.09),
        },
      ],
    } satisfies MessageInit<GetTranscriptResponse>;

    return create(GetTranscriptResponseSchema, init);
  }

  if (transcriptId === 'conv_002') {
    const init = {
      summary,
      systemPrompt:
        'You are a support ticket classification agent. Categorize low-touch requests and keep answers compact.',
      turns: [
        {
          turnId: 'turn_002_1',
          role: TranscriptTurnRole.USER,
          timestamp: timestampFromMs(now - 27 * 60 * 1000),
          content: 'How do I reset my password?',
        },
        {
          turnId: 'turn_002_2',
          role: TranscriptTurnRole.ASSISTANT,
          timestamp: timestampFromMs(now - 27 * 60 * 1000 + 26 * 1000),
          content:
            '{\n  "category": "account",\n  "priority": "low",\n  "sentiment": "neutral",\n  "suggested_action": "send_password_reset_link"\n}',
          model: 'gpt-4o-mini',
          latency: durationFromMs(900),
          usage: usage(208, 312, 520, 0.04),
        },
      ],
    } satisfies MessageInit<GetTranscriptResponse>;

    return create(GetTranscriptResponseSchema, init);
  }

  const init = {
    summary,
    systemPrompt:
      'You are a support ticket classification agent. Reject requests that exceed safe context limits and surface a useful error.',
    turns: [
      {
        turnId: 'turn_003_1',
        role: TranscriptTurnRole.USER,
        timestamp: timestampFromMs(now - 71 * 60 * 1000),
        content: 'Here is our entire conversation history from the past year and all attached artifacts...',
      },
      {
        turnId: 'turn_003_2',
        role: TranscriptTurnRole.ASSISTANT,
        timestamp: timestampFromMs(now - 71 * 60 * 1000 + 40 * 1000),
        content: '',
        model: 'gpt-4o',
        latency: durationFromMs(40 * 1000),
        usage: usage(1205, 0, 1205, 0.06),
        toolCalls: [
          {
            toolCallId: 'tool_003_1',
            name: 'analyze_sentiment',
            status: TranscriptToolCallStatus.ERROR,
            latency: durationFromMs(38 * 1000),
            error: { code: 'context_window_exceeded', message: 'Context window exceeded while processing input' },
          },
        ],
        error: { code: 'context_window_exceeded', message: 'Context window exceeded while processing input' },
      },
    ],
    error: { code: 'context_window_exceeded', message: 'Context window exceeded while processing input' },
  } satisfies MessageInit<GetTranscriptResponse>;

  return create(GetTranscriptResponseSchema, init);
};

export const isMockAIAgentTranscriptsEnabled = () => {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const searchValue = searchParams.get('mockAgentTranscripts');

  if (searchValue === '1') {
    window.sessionStorage.setItem(MOCK_AGENT_TRANSCRIPTS_STORAGE_KEY, '1');
    return true;
  }

  if (searchValue === '0') {
    window.sessionStorage.removeItem(MOCK_AGENT_TRANSCRIPTS_STORAGE_KEY);
    return false;
  }

  return window.sessionStorage.getItem(MOCK_AGENT_TRANSCRIPTS_STORAGE_KEY) === '1';
};
