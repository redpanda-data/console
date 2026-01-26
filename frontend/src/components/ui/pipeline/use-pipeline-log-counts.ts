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
import { useQueries } from '@tanstack/react-query';
import { config } from 'config';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  ListMessagesRequestSchema,
  type ListMessagesResponse_DataMessage,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { useMemo } from 'react';
import { parsePayloadAsJson, StartOffset } from 'react-query/api/messages';
import { REDPANDA_CONNECT_LOGS_TOPIC } from 'react-query/api/pipeline';
import { sanitizeString } from 'utils/filter-helper';
import { encodeBase64 } from 'utils/utils';

import { LOG_PATH_INPUT, LOG_PATH_OUTPUT } from '../logs/constants';
import { LOG_LEVELS, type LogLevel } from '../logs/types';

/** Number of most recent logs to consider per pipeline */
const LOGS_PER_PIPELINE = 50;

/** Time window in hours to look back for logs */
const TIME_WINDOW_HOURS = 5;

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
 * Compare two bigints for descending sort order.
 */
const compareBigIntDesc = (a: bigint, b: bigint): number => {
  if (b > a) {
    return 1;
  }
  if (b < a) {
    return -1;
  }
  return 0;
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
 * Fetch log counts for a single pipeline.
 *
 * Strategy:
 * 1. Fetch last LOGS_PER_PIPELINE logs for this pipeline (no level filter)
 * 2. Count WARN/ERROR within those logs, scoped by path
 */
const fetchSinglePipelineLogCounts = async (pipelineId: string): Promise<PipelineLogCounts> => {
  const counts = createEmptyCounts();

  const consoleClient = config.consoleClient;
  if (!consoleClient) {
    return counts;
  }

  // Simple filter: match this specific pipeline ID
  // Using var and simple equality for maximum interpreter compatibility
  const filterCode = `return key == "${pipelineId}";`;

  const startTime = Date.now() - TIME_WINDOW_HOURS * 60 * 60 * 1000;

  const request = create(ListMessagesRequestSchema, {
    topic: REDPANDA_CONNECT_LOGS_TOPIC,
    partitionId: -1,
    startOffset: StartOffset.TIMESTAMP,
    startTimestamp: BigInt(startTime),
    maxResults: LOGS_PER_PIPELINE,
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    includeOriginalRawPayload: false,
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
  });

  try {
    const stream = consoleClient.listMessages(request);
    const messages = await collectStreamMessages(stream);

    // Sort by timestamp descending to get most recent first
    const sortedMessages = messages
      .map((msg) => ({ msg, timestamp: msg.timestamp ?? BigInt(0) }))
      .sort((a, b) => compareBigIntDesc(a.timestamp, b.timestamp))
      .slice(0, LOGS_PER_PIPELINE);

    // Count WARN/ERROR within the snapshot
    for (const { msg } of sortedMessages) {
      const content = parsePayloadAsJson<ParsedLogMessage>(msg.value?.normalizedPayload);
      if (!content) {
        continue;
      }

      const level = content.level?.toUpperCase() as LogLevel | undefined;
      if (!(level && LOG_LEVELS.includes(level))) {
        continue;
      }

      if (level !== 'WARN' && level !== 'ERROR') {
        continue;
      }

      const path = content.path ?? null;
      const scope = getLogScope(path);

      if (level === 'WARN') {
        counts[scope].warnings += 1;
      } else {
        counts[scope].errors += 1;
      }
    }
  } catch {
    // Silently fail - return empty counts
  }

  return counts;
};

/**
 * Hook to fetch pipeline log counts for the given pipeline IDs.
 *
 * Uses useQueries for parallel fetching - each pipeline gets its own cached query.
 * This ensures we get data for all visible pipelines and enables efficient caching
 * when paginating (already-fetched pipelines use cached data).
 *
 * @param pipelineIds - Array of pipeline IDs to fetch counts for (should be visible IDs only)
 * @param enabled - Whether to enable the queries (default: true)
 */
export const usePipelineLogCounts = (pipelineIds: string[], enabled = true) => {
  const queries = useQueries({
    queries: pipelineIds.map((pipelineId) => ({
      queryKey: ['pipeline-log-counts', pipelineId],
      queryFn: () => fetchSinglePipelineLogCounts(pipelineId),
      enabled,
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    })),
  });

  // Combine results into a Map for easy lookup by pipeline ID
  const data = useMemo(() => {
    const map = new Map<string, PipelineLogCounts>();
    for (let i = 0; i < pipelineIds.length; i++) {
      const query = queries[i];
      if (query?.data) {
        map.set(pipelineIds[i], query.data);
      }
    }
    return map;
  }, [queries, pipelineIds]);

  // Aggregate loading state - true if any query is loading
  const isLoading = queries.some((q) => q.isLoading);

  return { data, isLoading };
};
