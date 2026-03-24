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

import { getRouteApi, useNavigate } from '@tanstack/react-router';
import {
  formatProtoDuration,
  formatProtoTimestamp,
  formatTokenCount,
} from 'components/pages/transcripts/utils/transcript-formatters';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from 'components/redpanda-ui/components/empty';
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
import { AlertCircle, RefreshCw, Search } from 'lucide-react';
import { TranscriptStatus } from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import { type ChangeEvent, useMemo, useState } from 'react';
import { useListTranscriptsQuery } from 'react-query/api/transcript';

import { ConversationStatusBadge } from './conversation-status-badge';

const routeApi = getRouteApi('/agents/$id/');

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'completed', label: 'Completed' },
  { value: 'error', label: 'Error' },
  { value: 'running', label: 'Running' },
] as const;

const statusToFilterKey = (status: TranscriptStatus): string => {
  switch (status) {
    case TranscriptStatus.COMPLETED:
      return 'completed';
    case TranscriptStatus.ERROR:
      return 'error';
    case TranscriptStatus.RUNNING:
      return 'running';
    default:
      return 'unspecified';
  }
};

export const AIAgentTranscriptsTab = () => {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, isLoading, isFetching, error, dataUpdatedAt, refetch } = useListTranscriptsQuery({ agentId: id });

  const transcripts = data?.transcripts ?? [];

  const filteredTranscripts = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return transcripts.filter((t) => {
      const matchesSearch =
        !query || t.conversationId.toLowerCase().includes(query) || t.userId.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || statusToFilterKey(t.status) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [transcripts, searchQuery, statusFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="size-4" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-24 items-center justify-center gap-2 text-destructive text-sm">
        <AlertCircle className="size-4" />
        <span>Error loading transcripts: {error.message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters + Refresh */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            value={searchQuery}
          />
        </div>
        <Select onValueChange={setStatusFilter} value={statusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {Boolean(dataUpdatedAt) && (
            <span className="text-muted-foreground text-sm">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button className="h-9" disabled={isFetching} onClick={() => refetch()} size="sm" variant="outline">
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Conversations Table */}
      <Card size="full">
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
          <CardDescription>View conversation transcripts for this agent</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {filteredTranscripts.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{transcripts.length > 0 ? 'No matching transcripts' : 'No transcripts yet'}</EmptyTitle>
                <EmptyDescription>
                  {transcripts.length > 0
                    ? 'No transcripts match your search criteria'
                    : 'Transcripts will appear here once this agent processes conversations'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table variant="simple">
              <TableHeader>
                <TableRow>
                  <TableHead>Conversation</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Turns</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTranscripts.map((transcript) => (
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    key={transcript.conversationId}
                    onClick={() => {
                      navigate({
                        to: '/agents/$id/transcripts/$conversationId',
                        params: { id, conversationId: transcript.conversationId },
                      });
                    }}
                  >
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {transcript.conversationId}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatProtoTimestamp(transcript.startTime)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatProtoDuration(transcript.duration)}</TableCell>
                    <TableCell className="text-center">{transcript.turnCount}</TableCell>
                    <TableCell>
                      <ConversationStatusBadge status={transcript.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatTokenCount(transcript.usage?.totalTokens)}
                    </TableCell>
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
