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
import {
  MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT,
  REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS,
  REDPANDA_CONNECT_LOGS_TOPIC,
} from 'react-query/api/pipeline';
import { sanitizeString } from 'utils/filter-helper';
import { encodeBase64 } from 'utils/utils';

import { LOG_LEVELS, LOG_PATH_INPUT, LOG_PATH_OUTPUT, type LogLevel } from './constants';

/**
 * Scoped log counts - issues are categorized by their source path.
 * - input: issues from root.input path
 * - output: issues from root.output path
 * - root: issues not scoped to input or output
 */
export type ScopedIssueCounts = {
  warnings: number;
  errors: number;
};

export type PipelineLogCounts = {
  input: ScopedIssueCounts;
  output: ScopedIssueCounts;
  root: ScopedIssueCounts;
  /** Total counts across all scopes (for backward compatibility) */
  total: ScopedIssueCounts;
};

type ParsedLogMessage = {
  level?: string;
  path?: string;
  [key: string]: unknown;
};

type ParsedLogInfo = {
  level: LogLevel | null;
  path: string | null;
};

const parseLogMessage = (message: ListMessagesResponse_DataMessage): ParsedLogInfo => {
  try {
    const content = parsePayloadAsJson<ParsedLogMessage>(message.value?.normalizedPayload);
    if (!content) {
      return { level: null, path: null };
    }
    const level = content.level?.toUpperCase() as LogLevel | undefined;
    const path = content.path ?? null;

    return {
      level: level && LOG_LEVELS.includes(level) ? level : null,
      path,
    };
  } catch {
    return { level: null, path: null };
  }
};

/**
 * Extract pipeline ID from message key payload.
 */
const extractPipelineId = (message: ListMessagesResponse_DataMessage): string => {
  const keyPayload = message.key?.normalizedPayload;
  if (!keyPayload || keyPayload.length === 0) {
    return '';
  }
  const keyStr = new TextDecoder().decode(keyPayload);
  // Remove quotes if present (JSON string)
  return keyStr.replace(/^"|"$/g, '');
};

const createEmptyCounts = (): PipelineLogCounts => ({
  input: { warnings: 0, errors: 0 },
  output: { warnings: 0, errors: 0 },
  root: { warnings: 0, errors: 0 },
  total: { warnings: 0, errors: 0 },
});

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
    // Stop on done or error
    if (controlMessage.case === 'done' || controlMessage.case === 'error') {
      break;
    }
  }

  return messages;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex filtering and counting logic across scopes
const fetchPipelineLogCounts = async (pipelineIds: string[]): Promise<Map<string, PipelineLogCounts>> => {
  const results = new Map<string, PipelineLogCounts>();

  // Initialize all pipeline IDs with zero counts
  for (const id of pipelineIds) {
    results.set(id, createEmptyCounts());
  }

  if (pipelineIds.length === 0) {
    return results;
  }

  const consoleClient = config.consoleClient;
  if (!consoleClient) {
    return results;
  }

  // Create filter code that matches any of the pipeline IDs and filters for WARN or ERROR level
  // The key is the pipeline ID, so we filter by key
  // We also need to filter by level in the value JSON
  const pipelineIdList = pipelineIds.map((id) => `"${id}"`).join(', ');
  const filterCode = `
    const pipelineIds = [${pipelineIdList}];
    if (!pipelineIds.includes(key)) return false;
    try {
      const value = JSON.parse(content);
      const level = (value.level || '').toUpperCase();
      return level === 'WARN' || level === 'ERROR';
    } catch {
      return false;
    }
  `;

  const startTime = Date.now() - REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS * 60 * 60 * 1000;

  const request = create(ListMessagesRequestSchema, {
    topic: REDPANDA_CONNECT_LOGS_TOPIC,
    partitionId: -1,
    startOffset: StartOffset.TIMESTAMP,
    startTimestamp: BigInt(startTime),
    maxResults: MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT,
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    includeOriginalRawPayload: false,
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
  });

  try {
    const stream = consoleClient.listMessages(request);
    const messages = await collectStreamMessages(stream);

    // Count warnings and errors per pipeline, scoped by path
    for (const message of messages) {
      const pipelineId = extractPipelineId(message);
      const counts = results.get(pipelineId);
      if (!counts) {
        continue;
      }

      const { level, path } = parseLogMessage(message);
      if (!level || (level !== 'WARN' && level !== 'ERROR')) {
        continue;
      }

      // Determine scope based on path
      let scope: 'input' | 'output' | 'root' = 'root';
      if (path?.startsWith(LOG_PATH_INPUT)) {
        scope = 'input';
      } else if (path?.startsWith(LOG_PATH_OUTPUT)) {
        scope = 'output';
      }

      // Update scoped counts
      if (level === 'WARN') {
        counts[scope].warnings += 1;
        counts.total.warnings += 1;
      } else if (level === 'ERROR') {
        counts[scope].errors += 1;
        counts.total.errors += 1;
      }
    }
  } catch {
    // Silently fail - we don't want to break the pipeline list if logs are unavailable
  }

  return results;
};

export const usePipelineLogCounts = (pipelineIds: string[], enabled = true) => {
  // Stabilize the pipeline IDs to prevent unnecessary re-fetches
  // Use JSON.stringify for stable comparison of array contents
  const sortedIds = useMemo(() => [...pipelineIds].sort(), [pipelineIds]);

  return useQuery({
    queryKey: ['pipeline-log-counts', sortedIds],
    queryFn: () => fetchPipelineLogCounts(sortedIds),
    enabled: enabled && sortedIds.length > 0,
    staleTime: 60 * 1000, // 1 minute - logs don't change that frequently
    refetchOnWindowFocus: false,
  });
};
