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
import { useQuery } from '@tanstack/react-query';
import { config } from 'config';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  ListMessagesRequestSchema,
  type ListMessagesResponse_DataMessage,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { useMemo } from 'react';
import { parsePayloadAsJson, StartOffset } from 'react-query/api/messages';
import { REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS, REDPANDA_CONNECT_LOGS_TOPIC } from 'react-query/api/pipeline';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';
import { sanitizeString } from 'utils/filter-helper';
import { encodeBase64 } from 'utils/utils';

import { LOG_PATH_INPUT, LOG_PATH_OUTPUT } from '../logs/constants';

/** Cache staleness time in milliseconds (30 seconds) */
const STALE_TIME_MS = 30 * 1000;

/** Cache garbage collection time in milliseconds (30 minutes) */
const GC_TIME_MS = 30 * 60 * 1000;

/**
 * Scoped log counts - warnings and errors for a specific scope.
 */
export type ScopedIssueCounts = {
  warnings: number;
  errors: number;
};

/**
 * Pipeline log counts categorized by scope.
 * - input: issues from root.input.* paths
 * - output: issues from root.output.* paths
 * - root: issues not scoped to input or output
 */
export type PipelineLogCounts = {
  input: ScopedIssueCounts;
  output: ScopedIssueCounts;
  root: ScopedIssueCounts;
};

type ParsedLogMessage = {
  level?: string;
  path?: string;
  [key: string]: unknown;
};

const createEmptyCounts = (): PipelineLogCounts => ({
  input: { warnings: 0, errors: 0 },
  output: { warnings: 0, errors: 0 },
  root: { warnings: 0, errors: 0 },
});

/** Stable empty Map to avoid creating new references on each render */
const EMPTY_MAP = new Map<string, PipelineLogCounts>();

/**
 * Determine scope based on log path.
 */
const getLogScope = (path: string | null): 'input' | 'output' | 'root' => {
  if (path?.startsWith(LOG_PATH_INPUT)) {
    return 'input';
  }
  if (path?.startsWith(LOG_PATH_OUTPUT)) {
    return 'output';
  }
  return 'root';
};

/**
 * Consume a server streaming response and collect all data messages.
 */
const collectStreamMessages = async (
  stream: AsyncIterable<import('protogen/redpanda/api/console/v1alpha1/list_messages_pb').ListMessagesResponse>
): Promise<ListMessagesResponse_DataMessage[]> => {
  const messages: ListMessagesResponse_DataMessage[] = [];

  for await (const response of stream) {
    const { controlMessage } = response;
    if (controlMessage.case === 'data') {
      messages.push(controlMessage.value);
    }
    if (controlMessage.case === 'done' || controlMessage.case === 'error') {
      break;
    }
  }

  return messages;
};

/**
 * Decode message key from Uint8Array to string.
 */
const decodeMessageKey = (keyPayload: Uint8Array | undefined): string | null => {
  if (!keyPayload || keyPayload.length === 0) {
    return null;
  }
  try {
    return new TextDecoder().decode(keyPayload);
  } catch {
    return null;
  }
};

/**
 * Build a JavaScript filter that matches any of the given pipeline IDs
 * AND filters for WARN/ERROR log levels only.
 *
 * This server-side filtering reduces data transfer and ensures we only
 * receive messages that will actually be counted.
 */
const buildBatchFilter = (pipelineIds: string[]): string => {
  const idsJson = JSON.stringify(pipelineIds);
  // Filter by pipeline ID (key) AND log level (in content JSON)
  // This reduces data transfer by filtering out INFO/DEBUG/TRACE logs server-side
  return `
    if (!${idsJson}.includes(key)) return false;
    try {
      var v = JSON.parse(content);
      var l = (v.level || '').toUpperCase();
      return l === 'WARN' || l === 'ERROR';
    } catch (e) {
      return false;
    }
  `;
};

type ParsedIssue = {
  pipelineId: string;
  level: 'WARN' | 'ERROR';
  scope: 'input' | 'output' | 'root';
};

/**
 * Parse a single message into a structured issue if it's a valid WARN/ERROR.
 */
const parseMessageAsIssue = (
  msg: ListMessagesResponse_DataMessage,
  validPipelineIds: Set<string>
): ParsedIssue | null => {
  const pipelineId = decodeMessageKey(msg.key?.normalizedPayload);
  if (!(pipelineId && validPipelineIds.has(pipelineId))) {
    return null;
  }

  const content = parsePayloadAsJson<ParsedLogMessage>(msg.value?.normalizedPayload);
  if (!content) {
    return null;
  }

  const level = content.level?.toUpperCase();
  if (level !== 'WARN' && level !== 'ERROR') {
    return null;
  }

  const path = content.path ?? null;
  return { pipelineId, level, scope: getLogScope(path) };
};

/**
 * Aggregate parsed issues into pipeline counts.
 * No per-pipeline limit - backend controls total via maxResults.
 */
const aggregateIssueCounts = (issues: ParsedIssue[], pipelineIds: string[]): Map<string, PipelineLogCounts> => {
  const results = new Map<string, PipelineLogCounts>();
  for (const id of pipelineIds) {
    results.set(id, createEmptyCounts());
  }

  for (const issue of issues) {
    const counts = results.get(issue.pipelineId) ?? createEmptyCounts();
    if (issue.level === 'WARN') {
      counts[issue.scope].warnings += 1;
    } else {
      counts[issue.scope].errors += 1;
    }
    results.set(issue.pipelineId, counts);
  }

  return results;
};

/**
 * Fetch log counts for multiple pipelines in a single batched request.
 *
 * Strategy:
 * 1. Build a single filter matching all pipeline IDs AND WARN/ERROR levels
 * 2. Fetch logs with centralized maxResults (backend controls limit)
 * 3. Parse messages into issues, aggregate counts by pipeline and scope
 */
const fetchBatchedLogCounts = async (pipelineIds: string[]): Promise<Map<string, PipelineLogCounts>> => {
  if (pipelineIds.length === 0) {
    return new Map();
  }

  const consoleClient = config.consoleClient;
  if (!consoleClient) {
    const results = new Map<string, PipelineLogCounts>();
    for (const id of pipelineIds) {
      results.set(id, createEmptyCounts());
    }
    return results;
  }

  const filterCode = buildBatchFilter(pipelineIds);
  // Use centralized constants - let backend control the limits
  const startTime = Date.now() - REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS * 60 * 60 * 1000;

  const request = create(ListMessagesRequestSchema, {
    topic: REDPANDA_CONNECT_LOGS_TOPIC,
    partitionId: -1,
    startOffset: StartOffset.TIMESTAMP,
    startTimestamp: BigInt(startTime),
    maxResults: MAX_PAGE_SIZE, // Backend-controlled limit
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    includeOriginalRawPayload: false,
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
  });

  try {
    const stream = consoleClient.listMessages(request);
    const messages = await collectStreamMessages(stream);
    const validPipelineIds = new Set(pipelineIds);

    // Parse all messages into issues
    const issues: ParsedIssue[] = [];
    for (const msg of messages) {
      const issue = parseMessageAsIssue(msg, validPipelineIds);
      if (issue) {
        issues.push(issue);
      }
    }

    return aggregateIssueCounts(issues, pipelineIds);
  } catch {
    // Silently fail - return empty counts for all pipelines
    const results = new Map<string, PipelineLogCounts>();
    for (const id of pipelineIds) {
      results.set(id, createEmptyCounts());
    }
    return results;
  }
};

/**
 * Hook to fetch pipeline log counts for the given pipeline IDs.
 *
 * Uses a single batched request to fetch logs for all pipelines at once,
 * reducing backend load from N requests to 1 request.
 *
 * @param pipelineIds - Array of pipeline IDs to fetch counts for (should be visible IDs only)
 * @param enabled - Whether to enable the query (default: true)
 */
export const usePipelineLogCounts = (pipelineIds: string[], enabled = true) => {
  // Create a stable query key based on sorted pipeline IDs
  // This ensures cache hits regardless of array order
  const sortedIds = useMemo(() => [...pipelineIds].sort(), [pipelineIds]);
  const queryKey = useMemo(() => ['pipeline-log-counts-batch', sortedIds.join(',')], [sortedIds]);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchBatchedLogCounts(sortedIds),
    enabled: enabled && sortedIds.length > 0,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchInterval: 30 * 1000, // Poll every 30 seconds
  });

  return {
    data: query.data ?? EMPTY_MAP,
    isLoading: query.isLoading,
    isStale: query.isStale,
    dataUpdatedAt: query.dataUpdatedAt,
  };
};
