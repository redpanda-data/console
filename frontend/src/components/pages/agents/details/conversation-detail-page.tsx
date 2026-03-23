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

import { durationMs } from '@bufbuild/protobuf/wkt';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Tabs, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Heading, InlineCode } from 'components/redpanda-ui/components/typography';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  History,
  List,
  MessageSquare,
  MessagesSquare,
  User,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import type { TranscriptToolCall, TranscriptTurn } from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import { TranscriptToolCallStatus, TranscriptTurnRole } from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import { useEffect, useMemo, useState } from 'react';
import { useGetTranscriptQuery } from 'react-query/api/transcript';
import { uiState } from 'state/ui-state';

import { ConversationStatusBadge } from './conversation-status-badge';
import { formatDuration, formatTimestamp } from './transcript-utils';

// -- Helpers --

const toolCallLatencyMs = (tc: TranscriptToolCall): number => {
  if (!tc.latency) {
    return 0;
  }
  return Math.round(durationMs(tc.latency));
};

const turnLatencyMs = (turn: TranscriptTurn): number => {
  if (!turn.latency) {
    return 0;
  }
  return Math.round(durationMs(turn.latency));
};

// -- Sub-components --

const ExpandableText = ({
  text,
  maxLength = 280,
  className = '',
}: {
  text: string;
  maxLength?: number;
  className?: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const trimmed = text.trim();
  const shouldTruncate = trimmed.length > maxLength;

  if (!shouldTruncate) {
    return <p className={`whitespace-pre-wrap text-sm leading-relaxed ${className}`}>{trimmed}</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className={`whitespace-pre-wrap text-sm leading-relaxed ${className}`}>
        {isExpanded ? trimmed : `${trimmed.slice(0, maxLength).trim()}...`}
      </p>
      <button
        aria-expanded={isExpanded}
        className="flex items-center gap-1 font-medium text-muted-foreground text-xs hover:text-foreground"
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        type="button"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="size-3" />
            Show less
          </>
        ) : (
          <>
            <ChevronDown className="size-3" />
            Show more ({trimmed.length - maxLength} more chars)
          </>
        )}
      </button>
    </div>
  );
};

const TokenSplitBar = ({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) => {
  const total = inputTokens + outputTokens;
  if (total === 0) {
    return null;
  }
  const inputPercent = Math.round((inputTokens / total) * 100);
  const outputPercent = 100 - inputPercent;

  return (
    <div className="space-y-1.5">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-muted-foreground/40" style={{ width: `${inputPercent}%` }} />
        <div className="bg-foreground" style={{ width: `${outputPercent}%` }} />
      </div>
      <div className="flex justify-between text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-muted-foreground/40" />
          In {inputPercent}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-foreground" />
          Out {outputPercent}%
        </span>
      </div>
    </div>
  );
};

const ToolCallItem = ({
  maxLatency,
  tool,
  isReconstructed = false,
}: {
  tool: TranscriptToolCall;
  maxLatency: number;
  isReconstructed?: boolean;
}) => {
  const latencyValue = toolCallLatencyMs(tool);
  const barWidth = maxLatency > 0 ? (latencyValue / maxLatency) * 100 : 0;
  const isSuccess = tool.status === TranscriptToolCallStatus.COMPLETED;
  const isError = tool.status === TranscriptToolCallStatus.ERROR;
  const hasLatency = !isReconstructed && latencyValue > 0;

  return (
    <div className="flex items-center gap-2">
      {isError ? (
        <XCircle className="size-3.5 shrink-0 text-destructive" />
      ) : (
        <CheckCircle className={`size-3.5 shrink-0 ${isSuccess ? 'text-emerald-600' : 'text-muted-foreground'}`} />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{tool.name}</span>
      <div className="flex w-28 items-center gap-2">
        {hasLatency ? (
          <>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground/60" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="w-14 text-right font-mono text-muted-foreground text-xs">{latencyValue}ms</span>
          </>
        ) : (
          <span className="ml-auto font-mono text-muted-foreground text-xs">&mdash;</span>
        )}
      </div>
    </div>
  );
};

// -- Interaction grouping --

interface Interaction {
  turnNumber: number;
  userInput: TranscriptTurn | null;
  agentResponses: TranscriptTurn[];
}

const groupTurnsIntoInteractions = (turns: TranscriptTurn[]): Interaction[] => {
  const interactions: Interaction[] = [];
  let current: Interaction | null = null;
  let turnCounter = 0;

  for (const turn of turns) {
    if (turn.role === TranscriptTurnRole.USER) {
      turnCounter++;
      if (current) {
        interactions.push(current);
      }
      current = { turnNumber: turnCounter, userInput: turn, agentResponses: [] };
    } else if (turn.role === TranscriptTurnRole.ASSISTANT || turn.role === TranscriptTurnRole.TOOL) {
      if (!current) {
        turnCounter++;
        current = { turnNumber: turnCounter, userInput: null, agentResponses: [] };
      }
      current.agentResponses.push(turn);
    }
  }

  if (current) {
    interactions.push(current);
  }

  return interactions;
};

// -- Views --

const ThreeColumnView = ({ interactions, systemPrompt }: { systemPrompt: string; interactions: Interaction[] }) => {
  return (
    <div className="space-y-6">
      {Boolean(systemPrompt) && (
        <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2">
          <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-muted-foreground text-xs">System: </span>
            <ExpandableText className="inline text-muted-foreground text-xs" maxLength={200} text={systemPrompt} />
          </div>
        </div>
      )}

      {interactions.map((interaction) => {
        const allToolCalls = interaction.agentResponses.flatMap((r) => r.toolCalls);
        const maxLatency = Math.max(...allToolCalls.map(toolCallLatencyMs), 0);

        const isReconstructed =
          interaction.userInput?.isReconstructed || interaction.agentResponses.some((r) => r.isReconstructed);

        const totalInputTokens = interaction.agentResponses.reduce(
          (sum, r) => sum + Number(r.usage?.inputTokens ?? 0n),
          0
        );
        const totalOutputTokens = interaction.agentResponses.reduce(
          (sum, r) => sum + Number(r.usage?.outputTokens ?? 0n),
          0
        );
        const totalTokens = totalInputTokens + totalOutputTokens;

        const endToEndMs = interaction.agentResponses
          .filter((r) => r.role === TranscriptTurnRole.ASSISTANT)
          .reduce((sum, r) => sum + turnLatencyMs(r), 0);

        const llmCalls = interaction.agentResponses.filter((r) => r.role === TranscriptTurnRole.ASSISTANT).length;
        const toolCallCount = allToolCalls.length;

        const userTimestamp = interaction.userInput?.timestamp
          ? new Date(Number(interaction.userInput.timestamp.seconds) * 1000).toLocaleTimeString()
          : '—';

        return (
          <Card
            className={`!gap-0 !p-0 ${isReconstructed ? 'border-dashed' : ''}`}
            key={interaction.turnNumber}
            size="full"
          >
            <CardContent className="flex flex-col p-0" space="none">
              {/* Turn label bar */}
              <div className="flex items-center gap-4 border-b bg-muted/30 px-4 py-2">
                <span className="font-medium text-xs">Turn {interaction.turnNumber}</span>
                {isReconstructed && (
                  <span className="flex items-center gap-1 text-muted-foreground text-xs">
                    <History className="size-3" />
                    Restored from history
                  </span>
                )}
                {!isReconstructed && <span className="text-muted-foreground text-xs">{userTimestamp}</span>}
                {!isReconstructed && (
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Zap className="size-3" />
                    <span className="font-mono">{totalTokens.toLocaleString()}</span>
                  </div>
                )}
                {!isReconstructed && (
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Clock className="size-3" />
                    <span className="font-mono">
                      {endToEndMs > 0 ? `${(endToEndMs / 1000).toFixed(1)}s` : '—'}
                    </span>
                  </div>
                )}
              </div>

              <div className={`grid grid-cols-3 ${isReconstructed ? 'opacity-75' : ''}`}>
                {/* User Input */}
                <div className="min-w-0 space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex size-6 items-center justify-center rounded-full bg-muted">
                      <User className="size-3.5 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-sm">User</span>
                  </div>
                  <div className="pl-8">
                    {interaction.userInput?.content ? (
                      <ExpandableText maxLength={300} text={interaction.userInput.content} />
                    ) : (
                      <p className="text-muted-foreground text-sm">&mdash;</p>
                    )}
                  </div>
                </div>

                {/* Agent Output */}
                <div className="min-w-0 space-y-2 border-l p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex size-6 items-center justify-center rounded-full bg-muted">
                      <Bot className="size-3.5 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-sm">Agent</span>
                  </div>
                  <div className="space-y-2 pl-8">
                    {interaction.agentResponses
                      .filter((r) => r.role === TranscriptTurnRole.ASSISTANT && Boolean(r.content))
                      .map((response) => (
                        <ExpandableText key={response.turnId} maxLength={400} text={response.content} />
                      ))}
                  </div>
                </div>

                {/* Performance sidebar */}
                <div className="min-w-0 border-l bg-muted/20 p-3">
                  {allToolCalls.length > 0 && (
                    <div className="mb-6">
                      <div className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Tools
                      </div>
                      <div className="space-y-1">
                        {allToolCalls.map((tool) => (
                          <ToolCallItem
                            isReconstructed={isReconstructed}
                            key={tool.toolCallId}
                            maxLatency={maxLatency}
                            tool={tool}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {isReconstructed ? (
                    <div className="text-muted-foreground text-xs">
                      <div className="mb-1.5 font-medium text-xs uppercase tracking-wide">Metrics</div>
                      <span>Not available for restored turns</span>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      <div className="mb-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                        Metrics
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Latency</span>
                        <span className="font-mono">
                          {endToEndMs > 0 ? `${(endToEndMs / 1000).toFixed(1)}s` : '—'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Calls</span>
                        <span className="font-mono">
                          {llmCalls} LLM / {toolCallCount} tool
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Tokens</span>
                        <span className="font-mono">
                          {totalInputTokens} in / {totalOutputTokens} out
                        </span>
                      </div>

                      <TokenSplitBar inputTokens={totalInputTokens} outputTokens={totalOutputTokens} />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const ChatView = ({ systemPrompt, turns }: { systemPrompt: string; turns: TranscriptTurn[] }) => {
  // Find the index where reconstruction ends and current turns begin.
  const firstCurrentIndex = turns.findIndex((t) => !t.isReconstructed);
  const hasReconstructedTurns = firstCurrentIndex > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {Boolean(systemPrompt) && (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2 font-medium text-muted-foreground text-xs">
            <FileText className="size-3" />
            System Prompt
          </div>
          <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{systemPrompt}</p>
        </div>
      )}

      {turns.map((turn, index) => {
        const prevTurn = index > 0 ? turns[index - 1] : null;
        const isUser = turn.role === TranscriptTurnRole.USER;
        const isAssistant = turn.role === TranscriptTurnRole.ASSISTANT;
        const isTool = turn.role === TranscriptTurnRole.TOOL;
        const isConsecutiveAgent =
          (prevTurn?.role === TranscriptTurnRole.ASSISTANT || prevTurn?.role === TranscriptTurnRole.TOOL) &&
          (isAssistant || isTool);
        const showHistorySeparator = hasReconstructedTurns && index === firstCurrentIndex;

        return (
          <div key={turn.turnId}>
            {showHistorySeparator && (
              <div className="flex items-center gap-3 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <History className="size-3" />
                  Earlier history restored from context
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <div
              className={`flex gap-3 ${isConsecutiveAgent ? 'ml-11' : ''} ${turn.isReconstructed ? 'opacity-75' : ''}`}
            >
              {!isConsecutiveAgent && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  {isUser ? (
                    <User className="size-4 text-muted-foreground" />
                  ) : (
                    <Bot className="size-4 text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="flex-1 space-y-2">
                {!isConsecutiveAgent && <span className="font-medium text-sm">{isUser ? 'User' : 'Agent'}</span>}

                {isAssistant && turn.toolCalls.length > 0 && (
                  <div
                    className={`flex flex-wrap items-center gap-1.5 rounded-md border px-3 py-2 ${turn.isReconstructed ? 'border-dashed bg-muted/20' : 'bg-muted/30'}`}
                  >
                    <Wrench className="size-3.5 text-muted-foreground" />
                    {turn.toolCalls.map((tool) => (
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs ${
                          tool.status === TranscriptToolCallStatus.COMPLETED
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : tool.status === TranscriptToolCallStatus.ERROR
                              ? 'bg-red-500/10 text-red-700'
                              : 'bg-muted text-muted-foreground'
                        }`}
                        key={tool.toolCallId}
                      >
                        {tool.status === TranscriptToolCallStatus.COMPLETED ? (
                          <CheckCircle className="size-3" />
                        ) : tool.status === TranscriptToolCallStatus.ERROR ? (
                          <XCircle className="size-3" />
                        ) : null}
                        {tool.name}
                      </span>
                    ))}
                  </div>
                )}

                {Boolean(turn.content) && (
                  <div
                    className={`rounded-lg px-4 py-3 ${isUser ? 'bg-muted' : 'border bg-card'} ${turn.isReconstructed ? 'border-dashed' : ''}`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.content}</p>
                    <div className="mt-2 flex items-center gap-3 text-muted-foreground text-xs">
                      {!turn.isReconstructed && (
                        <span>
                          {turn.timestamp
                            ? new Date(Number(turn.timestamp.seconds) * 1000).toLocaleTimeString()
                            : ''}
                        </span>
                      )}
                      {!isUser && !turn.isReconstructed && Boolean(turn.latency) && (
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatDuration(turn.latency)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// -- Main page --

const routeApi = getRouteApi('/agents/$id/transcripts/$conversationId');

export const ConversationDetailPage = () => {
  const { id, conversationId } = routeApi.useParams();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'chat' | 'detailed'>('detailed');

  const { data, isLoading, error } = useGetTranscriptQuery({ agentId: id, conversationId });
  const summary = data?.summary;
  const systemPrompt = data?.systemPrompt ?? '';
  const turns = data?.turns ?? [];

  const interactions = useMemo(() => groupTurnsIntoInteractions(turns), [turns]);

  useEffect(() => {
    uiState.pageTitle = 'Conversation';
    uiState.pageBreadcrumbs = [
      { title: 'AI Agents', linkTo: '/agents' },
      { title: summary?.agentId ?? id, linkTo: `/agents/${id}?tab=transcripts` },
      { title: 'Conversation', linkTo: '', heading: 'Conversation' },
    ];
  }, [id, summary?.agentId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4" />
          Failed to load transcript: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        {/* Left: Title and metadata */}
        <div className="flex items-start gap-3">
          <Button
            aria-label="Back to transcripts"
            className="size-8"
            onClick={() => {
              navigate({ to: '/agents/$id', params: { id }, search: { tab: 'transcripts' } });
            }}
            size="icon"
            variant="ghost"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted-foreground" />
              <Heading level={1}>Conversation</Heading>
              <InlineCode>{conversationId}</InlineCode>
              {summary ? <ConversationStatusBadge status={summary.status} /> : null}
            </div>
            <div className="mt-1 flex items-center gap-4 text-muted-foreground text-xs">
              <span>{formatTimestamp(summary?.startTime)}</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatDuration(summary?.duration)}
              </span>
              <span>{summary?.turnCount ?? 0} turns</span>
            </div>
          </div>
        </div>

        {/* Right: Stats chips + View toggle */}
        <div className="flex items-center gap-2">
          {summary?.usage ? (
            <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
              <Zap className="size-3 text-muted-foreground" />
              <span className="font-medium font-mono text-xs">
                {Number(summary.usage.totalTokens).toLocaleString()}
              </span>
            </div>
          ) : null}

          <Tabs onValueChange={(v) => setViewMode(v as 'chat' | 'detailed')} value={viewMode}>
            <TabsList>
              <TabsTrigger className="gap-1.5" value="chat">
                <MessagesSquare className="size-3.5" />
                Chat
              </TabsTrigger>
              <TabsTrigger className="gap-1.5" value="detailed">
                <List className="size-3.5" />
                Detailed
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'detailed' ? (
        <ThreeColumnView interactions={interactions} systemPrompt={systemPrompt} />
      ) : (
        <ChatView systemPrompt={systemPrompt} turns={turns} />
      )}
    </div>
  );
};
