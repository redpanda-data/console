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

const routeApi = getRouteApi('/agents/$id');

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Search } from 'lucide-react';
import { TranscriptStatus } from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import { useMemo, useState } from 'react';
import { useListTranscriptsQuery } from 'react-query/api/ai-agent';

import { getMockAIAgentTranscriptSummaries, isMockAIAgentTranscriptsEnabled } from './ai-agent-transcripts-mock-data';
import {
  formatTranscriptDateTime,
  formatTranscriptDuration,
  formatTranscriptTokens,
  TranscriptStatusBadge,
} from './ai-agent-transcripts-shared';

type StatusFilterValue = 'all' | 'completed' | 'error' | 'running';

const filterMatchesStatus = (value: number, filter: StatusFilterValue) => {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'completed') {
    return value === TranscriptStatus.COMPLETED;
  }
  if (filter === 'error') {
    return value === TranscriptStatus.ERROR;
  }
  return value === TranscriptStatus.RUNNING;
};

const isUnavailableTranscriptError = (error: unknown) =>
  error instanceof ConnectError &&
  (error.code === Code.Unimplemented || error.code === Code.Unavailable || error.code === Code.FailedPrecondition);

export const AIAgentTranscriptsTab = () => {
  const { id } = routeApi.useParams();
  const navigate = useNavigate({ from: '/agents/$id' });
  const mockAgentTranscripts = routeApi.useSearch({ select: (search) => search.mockAgentTranscripts });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilterValue>('all');
  const shouldUseMockData = isMockAIAgentTranscriptsEnabled();

  const transcriptsQuery = useListTranscriptsQuery(
    { agentId: id || '', pageSize: 50 },
    { enabled: !!id && !shouldUseMockData }
  );

  const transcripts = shouldUseMockData
    ? getMockAIAgentTranscriptSummaries(id || '')
    : (transcriptsQuery.data?.transcripts ?? []);

  const filteredTranscripts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return transcripts.filter((transcript) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        transcript.conversationId.toLowerCase().includes(normalizedQuery) ||
        transcript.title.toLowerCase().includes(normalizedQuery) ||
        transcript.userId.toLowerCase().includes(normalizedQuery);

      return matchesQuery && filterMatchesStatus(transcript.status, status);
    });
  }, [query, status, transcripts]);

  const stats = useMemo(
    () => ({
      total: transcripts.length,
      completed: transcripts.filter((item) => item.status === TranscriptStatus.COMPLETED).length,
      errors: transcripts.filter((item) => item.status === TranscriptStatus.ERROR).length,
      totalTokens: transcripts.reduce((sum, item) => sum + Number(item.usage?.totalTokens ?? 0), 0),
    }),
    [transcripts]
  );

  if (transcriptsQuery.isLoading && !shouldUseMockData) {
    return (
      <Card size="full">
        <CardContent className="flex items-center justify-center py-16">
          <div className="flex items-center gap-2">
            <Spinner className="size-4" />
            <Text>Loading transcripts...</Text>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!shouldUseMockData && transcriptsQuery.error) {
    if (isUnavailableTranscriptError(transcriptsQuery.error)) {
      return (
        <Card size="full">
          <CardHeader>
            <CardTitle>Transcripts</CardTitle>
            <CardDescription>
              The transcript API is defined, but the backend implementation is not available yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Text className="text-muted-foreground">
              Once the enterprise backend implements `ListTranscripts`, this tab will load real agent-specific
              transcripts.
            </Text>
            {process.env.NODE_ENV === 'development' && (
              <Text className="text-muted-foreground" variant="small">
                Append `mockAgentTranscripts=1` to the URL to preview the mocked UI locally.
              </Text>
            )}
          </CardContent>
        </Card>
      );
    }

    return (
      <Card size="full">
        <CardContent className="flex items-center gap-2 py-16 text-red-600">
          <AlertCircle className="size-4" />
          <Text>Error loading transcripts: {transcriptsQuery.error.message}</Text>
        </CardContent>
      </Card>
    );
  }

  if (transcripts.length === 0) {
    return (
      <Card size="full">
        <CardHeader>
          <CardTitle>Transcripts</CardTitle>
          <CardDescription>
            Transcript conversations for this agent will appear here once the agent starts serving traffic.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total transcripts</CardDescription>
            <CardTitle>{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle>{stats.completed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Errors</CardDescription>
            <CardTitle>{stats.errors}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tokens</CardDescription>
            <CardTitle>{stats.totalTokens.toLocaleString('en-US')}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card size="full">
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Agent transcripts</CardTitle>
            <CardDescription>Only transcripts associated with this agent are shown here.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search transcripts"
                value={query}
              />
            </div>
            <Select onValueChange={(value: StatusFilterValue) => setStatus(value)} value={status}>
              <SelectTrigger className="min-w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="running">Running</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTranscripts.length === 0 ? (
            <div className="py-10 text-center">
              <Text className="text-muted-foreground">No transcripts match the current filters.</Text>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transcript</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Turns</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTranscripts.map((transcript) => (
                  <TableRow
                    className="cursor-pointer"
                    key={transcript.conversationId}
                    onClick={() =>
                      navigate({
                        to: '/agents/$id/transcripts/$transcriptId',
                        params: { id, transcriptId: transcript.conversationId },
                        search: mockAgentTranscripts ? { mockAgentTranscripts } : undefined,
                      })
                    }
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <Text className="font-medium">{transcript.title}</Text>
                        <Text className="font-mono text-muted-foreground text-xs">{transcript.conversationId}</Text>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TranscriptStatusBadge status={transcript.status} />
                    </TableCell>
                    <TableCell>{formatTranscriptDuration(transcript.duration)}</TableCell>
                    <TableCell>{transcript.turnCount}</TableCell>
                    <TableCell>{formatTranscriptTokens(transcript.usage?.totalTokens)}</TableCell>
                    <TableCell>{formatTranscriptDateTime(transcript.startTime)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
