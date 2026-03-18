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

'use no memo';

import { Code, ConnectError } from '@connectrpc/connect';
import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/agents/$id/transcripts/$transcriptId');

import { create } from '@bufbuild/protobuf';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Tabs } from 'components/redpanda-ui/components/tabs';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import {
  type GetTranscriptResponse,
  TranscriptStatus,
  TranscriptSummarySchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import { useEffect } from 'react';
import { useGetAIAgentQuery, useGetTranscriptQuery } from 'react-query/api/ai-agent';
import { uiState } from 'state/ui-state';

import { AIAgentDetailsHeader } from './ai-agent-details-header';
import { type AIAgentDetailsTab, AIAgentDetailsTabs } from './ai-agent-details-tabs';
import { getMockAIAgentTranscript, isMockAIAgentTranscriptsEnabled } from './ai-agent-transcripts-mock-data';
import {
  formatTranscriptDateTime,
  formatTranscriptDuration,
  formatTranscriptTokens,
  TranscriptStatusBadge,
  transcriptRoleLabel,
} from './ai-agent-transcripts-shared';

const isUnavailableTranscriptError = (error: unknown) =>
  error instanceof ConnectError &&
  (error.code === Code.Unimplemented || error.code === Code.Unavailable || error.code === Code.FailedPrecondition);

const AIAgentTranscriptDetailsUnavailable = ({ id }: { id: string }) => (
  <div className="flex flex-col gap-4 pb-1">
    <AIAgentDetailsHeader agentId={id} />
    <Tabs value="transcripts">
      <AIAgentDetailsTabs />
    </Tabs>
    <Card size="full">
      <CardHeader>
        <CardTitle>Transcript details</CardTitle>
        <CardDescription>The transcript detail RPC is not implemented by the backend yet.</CardDescription>
      </CardHeader>
    </Card>
  </div>
);

const navigateToAIAgentDetailsTab = (
  navigate: ReturnType<typeof useNavigate>,
  id: string,
  tab: AIAgentDetailsTab,
  mockAgentTranscripts?: string
) => {
  if (tab === 'transcripts') {
    navigate({ to: '/agents/$id', params: { id }, search: { mockAgentTranscripts, tab: 'transcripts' } });
    return;
  }

  navigate({ to: '/agents/$id', params: { id }, search: { mockAgentTranscripts, tab } });
};

type TranscriptPageState =
  | { kind: 'agent-error'; message: string }
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; transcript: GetTranscriptResponse }
  | { kind: 'transcript-error'; message: string }
  | { kind: 'transcript-unavailable' };

const getTranscriptPageState = ({
  agentError,
  isLoading,
  shouldUseMockData,
  transcript,
  transcriptError,
}: {
  agentError?: Error | null;
  isLoading: boolean;
  shouldUseMockData: boolean;
  transcript: GetTranscriptResponse | null;
  transcriptError?: Error | null;
}): TranscriptPageState => {
  if (isLoading) {
    return { kind: 'loading' };
  }

  if (agentError) {
    return { kind: 'agent-error', message: agentError.message };
  }

  if (!shouldUseMockData && transcriptError) {
    if (isUnavailableTranscriptError(transcriptError)) {
      return { kind: 'transcript-unavailable' };
    }

    return { kind: 'transcript-error', message: transcriptError.message };
  }

  if (!transcript) {
    return { kind: 'not-found' };
  }

  return { kind: 'ready', transcript };
};

export const AIAgentTranscriptDetailsPage = () => {
  const { id, transcriptId } = routeApi.useParams();
  const navigate = useNavigate({ from: '/agents/$id/transcripts/$transcriptId' });
  const mockAgentTranscripts = routeApi.useSearch({ select: (search) => search.mockAgentTranscripts });
  const shouldUseMockData = isMockAIAgentTranscriptsEnabled();

  const agentQuery = useGetAIAgentQuery({ id }, { enabled: !!id });
  const transcriptQuery = useGetTranscriptQuery(
    { agentId: id, conversationId: transcriptId },
    { enabled: !!id && !!transcriptId && !shouldUseMockData }
  );

  const transcript = shouldUseMockData ? getMockAIAgentTranscript(id, transcriptId) : (transcriptQuery.data ?? null);
  const pageState = getTranscriptPageState({
    shouldUseMockData,
    agentError: agentQuery.error,
    isLoading: agentQuery.isLoading || (!shouldUseMockData && transcriptQuery.isLoading),
    transcript,
    transcriptError: transcriptQuery.error,
  });

  useEffect(() => {
    const name = agentQuery.data?.aiAgent?.displayName;
    uiState.pageTitle = name ? `AI Agent - ${name}` : 'AI Agent Details';
    uiState.pageBreadcrumbs = [
      { title: 'AI Agents', linkTo: '/agents' },
      { title: name || 'Details', linkTo: `/agents/${id}?tab=transcripts`, heading: name || 'AI Agent Details' },
    ];
  }, [agentQuery.data, id]);

  const handleTabChange = (value: string) => {
    navigateToAIAgentDetailsTab(navigate, id, value as AIAgentDetailsTab, mockAgentTranscripts);
  };

  if (pageState.kind === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <Text>Loading transcript details...</Text>
      </div>
    );
  }

  if (pageState.kind === 'agent-error') {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-red-600">
        <AlertCircle className="h-4 w-4" />
        Error loading AI agent: {pageState.message}
      </div>
    );
  }

  if (pageState.kind === 'transcript-unavailable') {
    return <AIAgentTranscriptDetailsUnavailable id={id} />;
  }

  if (pageState.kind === 'transcript-error') {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-red-600">
        <AlertCircle className="h-4 w-4" />
        Error loading transcript: {pageState.message}
      </div>
    );
  }

  if (pageState.kind === 'not-found') {
    return (
      <div className="flex flex-col gap-4 pb-1">
        <AIAgentDetailsHeader agentId={id} />
        <Tabs onValueChange={handleTabChange} value="transcripts">
          <AIAgentDetailsTabs />
        </Tabs>
        <Card size="full">
          <CardHeader>
            <CardTitle>Transcript not found</CardTitle>
            <CardDescription>The requested transcript could not be located for this agent.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const transcriptData = pageState.transcript;

  const summary =
    transcriptData.summary ??
    create(TranscriptSummarySchema, {
      conversationId: transcriptId,
      agentId: id,
      title: transcriptId,
      status: TranscriptStatus.UNSPECIFIED,
      turnCount: transcriptData.turns.length,
      usage: {
        inputTokens: 0n,
        outputTokens: 0n,
        totalTokens: 0n,
      },
    });

  return (
    <div className="flex flex-col gap-4 pb-1">
      <AIAgentDetailsHeader agentId={id} />

      <Tabs onValueChange={handleTabChange} value="transcripts">
        <AIAgentDetailsTabs />
      </Tabs>

      <div className="flex items-center justify-between">
        <Button
          onClick={() =>
            navigate({
              to: '/agents/$id',
              params: { id },
              search: {
                mockAgentTranscripts,
                tab: 'transcripts',
              },
            })
          }
          variant="ghost"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to transcripts
        </Button>
        <div className="flex items-center gap-2">
          <TranscriptStatusBadge status={summary.status} />
          <Text className="font-mono text-muted-foreground text-xs">{summary.conversationId}</Text>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Started</CardDescription>
            <CardTitle className="text-base">{formatTranscriptDateTime(summary.startTime)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Duration</CardDescription>
            <CardTitle>{formatTranscriptDuration(summary.duration)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Turns</CardDescription>
            <CardTitle>{summary.turnCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tokens</CardDescription>
            <CardTitle>{formatTranscriptTokens(summary.usage?.totalTokens)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card size="full">
        <CardHeader>
          <CardTitle>{summary.title}</CardTitle>
          <CardDescription>User {summary.userId || 'N/A'}</CardDescription>
        </CardHeader>
        {Boolean(transcriptData.systemPrompt) && (
          <CardContent className="pt-0">
            <div className="rounded-md border border-dashed p-4">
              <Text className="mb-1 font-medium">System prompt</Text>
              <Text className="whitespace-pre-wrap text-muted-foreground">{transcriptData.systemPrompt}</Text>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        {transcriptData.turns.map((turn) => (
          <Card key={turn.turnId} size="full">
            <CardHeader>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg">{transcriptRoleLabel(turn.role)}</CardTitle>
                  <CardDescription>{formatTranscriptDateTime(turn.timestamp)}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {turn.model ? <Text className="font-mono text-muted-foreground text-xs">{turn.model}</Text> : null}
                  {turn.latency ? (
                    <Text className="text-muted-foreground text-xs">{formatTranscriptDuration(turn.latency)}</Text>
                  ) : null}
                  {turn.usage ? (
                    <Text className="text-muted-foreground text-xs">
                      {formatTranscriptTokens(turn.usage.totalTokens)} tokens
                    </Text>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {turn.content ? (
                <div className="rounded-md bg-muted/40 p-4">
                  <Text className="whitespace-pre-wrap">{turn.content}</Text>
                </div>
              ) : (
                <Text className="text-muted-foreground" variant="small">
                  No direct content captured for this turn.
                </Text>
              )}

              {turn.toolCalls.length > 0 ? (
                <div className="space-y-2">
                  <Text className="font-medium">Tool calls</Text>
                  <div className="grid gap-2">
                    {turn.toolCalls.map((toolCall) => (
                      <div className="rounded-md border p-3" key={toolCall.toolCallId || toolCall.name}>
                        <div className="flex items-center justify-between gap-3">
                          <Text className="font-mono text-sm">{toolCall.name}</Text>
                          <Text className="text-muted-foreground text-xs">
                            {formatTranscriptDuration(toolCall.latency)}
                          </Text>
                        </div>
                        {toolCall.output ? (
                          <Text className="mt-2 whitespace-pre-wrap text-muted-foreground text-sm">
                            {toolCall.output}
                          </Text>
                        ) : null}
                        {toolCall.error?.message ? (
                          <Text className="mt-2 text-red-600 text-sm">{toolCall.error.message}</Text>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {turn.error?.message ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {turn.error.message}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
