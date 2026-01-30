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

import { LOG_PATH_INPUT, LOG_PATH_OUTPUT } from 'components/ui/logs/constants';
import type { ListMessagesResponse_DataMessage } from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { useMemo } from 'react';
import { sanitizeString } from 'utils/filter-helper';
import { encodeBase64 } from 'utils/utils';

import { parsePayloadAsJson, StartOffset, useListMessagesStream } from './messages';
import { REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS, REDPANDA_CONNECT_LOGS_TOPIC } from './pipeline';

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

/**
 * Create empty counts structure.
 */
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
 * Decode message key from Uint8Array to string.
 * Removes surrounding quotes if present (JSON string encoding).
 */
const decodeMessageKey = (keyPayload: Uint8Array | undefined): string | null => {
  if (!keyPayload || keyPayload.length === 0) {
    return null;
  }
  try {
    const decoded = new TextDecoder().decode(keyPayload);
    // Remove quotes if present (same as use-pipeline-logs.ts:86-87)
    return decoded.replace(/^"|"$/g, '');
  } catch {
    return null;
  }
};

/**
 * Build JavaScript filter code that matches pipeline IDs.
 * Level filtering (WARN/ERROR) is done client-side in aggregateMessages.
 */
const buildFilterCode = (pipelineIds: string[]): string => {
  // Use simple indexOf check - works for both single and multiple IDs
  const idsArray = pipelineIds.map((id) => `"${id}"`).join(',');
  const filterCode = `return [${idsArray}].indexOf(key) >= 0;`;

  return encodeBase64(sanitizeString(filterCode));
};

/**
 * Aggregate messages into pipeline log counts.
 * Filters for WARN/ERROR levels and categorizes by scope (input/output/root).
 */
const aggregateMessages = (
  messages: ListMessagesResponse_DataMessage[],
  validPipelineIds: Set<string>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 27, refactor later
): Map<string, PipelineLogCounts> => {
  const results = new Map<string, PipelineLogCounts>();

  for (const id of validPipelineIds) {
    results.set(id, createEmptyCounts());
  }

  const pipelineIdsSeen = new Set<string>();
  const sampleMessages: Array<{ pipelineId: string; level: string; path: string | null; scope: string }> = [];

  for (const msg of messages) {
    const pipelineId = decodeMessageKey(msg.key?.normalizedPayload);
    if (!(pipelineId && validPipelineIds.has(pipelineId))) {
      continue;
    }

    const content = parsePayloadAsJson<ParsedLogMessage>(msg.value?.normalizedPayload);
    if (!content) {
      continue;
    }

    const level = content.level?.toUpperCase();
    if (level !== 'WARN' && level !== 'ERROR') {
      continue;
    }

    const path = content.path ?? null;
    const scope = getLogScope(path);
    const counts = results.get(pipelineId) ?? createEmptyCounts();

    // Collect sample for debugging
    pipelineIdsSeen.add(pipelineId);
    if (sampleMessages.length < 10) {
      sampleMessages.push({ pipelineId, level: level ?? 'unknown', path, scope });
    }

    if (level === 'WARN') {
      counts[scope].warnings += 1;
    } else {
      counts[scope].errors += 1;
    }

    results.set(pipelineId, counts);
  }

  return results;
};

export type StreamingPipelineLogCountsResult = {
  /** Aggregated counts per pipeline ID */
  counts: Map<string, PipelineLogCounts>;
  /** Whether the stream is currently running */
  isStreaming: boolean;
  /** Error message if the stream failed */
  error: string | null;
  /** Reset state and restart the stream */
  reset: () => void;
};

/**
 * Hook for streaming pipeline log counts in real-time.
 *
 * Streams from the __redpanda.connect.logs topic and aggregates
 * WARN/ERROR messages by pipeline ID and scope (input/output/root).
 *
 * @param pipelineIds - Array of pipeline IDs to filter for
 * @param enabled - Whether to enable the stream (default: true)
 */
export const useStreamingPipelineLogCounts = (
  pipelineIds: string[],
  enabled = true
): StreamingPipelineLogCountsResult => {
  const startTimestamp = useMemo(
    () => BigInt(Date.now() - REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS * 60 * 60 * 1000),
    []
  );

  const filterInterpreterCode = useMemo(() => {
    if (pipelineIds.length === 0) {
      return '';
    }
    return buildFilterCode(pipelineIds);
  }, [pipelineIds]);

  const validPipelineIds = useMemo(() => new Set(pipelineIds), [pipelineIds]);

  // Use a higher limit to ensure we get messages from all pipelines
  // Messages come in order, so a low limit might only return messages from one pipeline
  const maxResults = pipelineIds.length * 500;

  const stream = useListMessagesStream({
    topic: REDPANDA_CONNECT_LOGS_TOPIC,
    startOffset: StartOffset.TIMESTAMP,
    startTimestamp,
    partitionId: -1,
    filterInterpreterCode,
    maxResults,
    enabled: enabled && pipelineIds.length > 0,
  });

  const counts = useMemo(
    () => aggregateMessages(stream.messages, validPipelineIds),
    [stream.messages, validPipelineIds]
  );

  return {
    counts,
    isStreaming: stream.isStreaming,
    error: stream.error?.message ?? null,
    reset: stream.reset,
  };
};
