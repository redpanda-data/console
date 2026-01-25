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

import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import type { ListMessagesResponse_DataMessage } from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { useMemo } from 'react';
import {
  type ListMessagesStreamResult,
  parsePayloadAsJson,
  StartOffset,
  useListMessagesStream,
} from 'react-query/api/messages';
import { REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS, REDPANDA_CONNECT_LOGS_TOPIC } from 'react-query/api/pipeline';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';
import { sanitizeString } from 'utils/filter-helper';
import { encodeBase64 } from 'utils/utils';

import {
  LOG_LEVELS,
  LOG_PATH_INPUT,
  LOG_PATH_OUTPUT,
  type LogLevel,
  type ParsedLogContent,
  type ParsedLogEntry,
} from '../logs';

export type PipelineLogScope = 'input' | 'output' | 'root';

/**
 * Pipeline-specific log entry that extends the generic ParsedLogEntry.
 * Includes `pipelineId` as an alias for the generic `id` field.
 */
export type ParsedPipelineLog = ParsedLogEntry & {
  /** Pipeline ID (from message key) - alias for generic id field */
  pipelineId: string;
  /** Scope derived from path (input, output, root) */
  scope: PipelineLogScope;
  /** Parsed log content */
  content: ParsedLogContent | null;
};

export type UsePipelineLogsOptions = {
  /** Pipeline ID to filter logs for */
  pipelineId: string;
  /** Maximum number of logs to fetch */
  maxResults?: number;
  /** Time window in hours to look back */
  timeWindowHours?: number;
  /** Whether to start streaming immediately */
  enabled?: boolean;
  /** Filter by log levels (defaults to all levels) */
  levels?: LogLevel[];
};

export type UsePipelineLogsResult = Omit<ListMessagesStreamResult, 'messages'> & {
  /** Parsed pipeline logs */
  logs: ParsedPipelineLog[];
  /** Raw messages (for advanced use cases) */
  rawMessages: ListMessagesResponse_DataMessage[];
};

/**
 * Determine the scope of a log based on its path.
 */
const getLogScope = (path: string | null): PipelineLogScope => {
  if (path?.startsWith(LOG_PATH_INPUT)) {
    return 'input';
  }
  if (path?.startsWith(LOG_PATH_OUTPUT)) {
    return 'output';
  }
  return 'root';
};

/**
 * Parse a message into a structured pipeline log.
 */
const parsePipelineLog = (message: ListMessagesResponse_DataMessage): ParsedPipelineLog => {
  // Extract pipeline ID from key
  const keyPayload = message.key?.normalizedPayload;
  let pipelineId = '';
  if (keyPayload) {
    const keyStr = new TextDecoder().decode(keyPayload);
    // Remove quotes if present (JSON string)
    pipelineId = keyStr.replace(/^"|"$/g, '');
  }

  // Parse value payload as JSON
  const content = parsePayloadAsJson<ParsedLogContent>(message.value?.normalizedPayload);

  // Extract level and path from content
  const level = content?.level?.toUpperCase() as LogLevel | undefined;
  const validLevel = level && LOG_LEVELS.includes(level) ? level : null;
  const path = content?.path ?? null;
  const scope = getLogScope(path);

  return {
    // Generic ParsedLogEntry fields
    message,
    id: pipelineId, // Generic ID field for LogExplorer compatibility
    level: validLevel,
    path,
    scope,
    content,
    timestamp: message.timestamp,
    offset: message.offset,
    partitionId: message.partitionId,
    // Pipeline-specific field (alias)
    pipelineId,
  };
};

/**
 * Create a filter code for pipeline logs.
 * Uses the same simple pattern as the working legacy LogsTab filter.
 */
const createPipelineLogFilter = (pipelineId: string, levels?: LogLevel[]): string => {
  // Simple filter matching the working legacy pattern
  // key == pipelineId (using loose equality like the old filter)
  if (!levels || levels.length === 0) {
    return `return key == "${pipelineId}";`;
  }

  // With level filtering, we need to parse the content
  const levelsArray = levels.map((l) => `"${l}"`).join(', ');
  return `
    if (key != "${pipelineId}") return false;
    try {
      var value = JSON.parse(content);
      var levels = [${levelsArray}];
      var logLevel = (value.level || '').toUpperCase();
      return levels.indexOf(logLevel) >= 0;
    } catch (e) {
      return false;
    }
  `;
};

/**
 * Hook for streaming pipeline logs using Connect RPC.
 *
 * This hook wraps useListMessagesStream with pipeline-specific defaults:
 * - Topic: __redpanda.connect.logs
 * - Filter: by pipeline ID (message key)
 * - Time window: configurable, defaults to 5 hours
 * - Max results: configurable, defaults to 1000
 *
 * The returned logs conform to ParsedLogEntry and can be used directly with LogExplorer.
 *
 * @example
 * ```tsx
 * const { logs, isStreaming, error, reset } = usePipelineLogs({
 *   pipelineId: 'my-pipeline-id',
 *   levels: ['WARN', 'ERROR'], // Optional: filter by levels
 * });
 *
 * <LogExplorer
 *   logs={logs}
 *   isLoading={isStreaming}
 *   error={error?.message}
 *   onRefresh={reset}
 *   showId={false}  // Hide ID column since logs are for single pipeline
 *   idLabel="Pipeline ID"
 * />
 * ```
 */
export const usePipelineLogs = (options: UsePipelineLogsOptions): UsePipelineLogsResult => {
  const {
    pipelineId,
    maxResults = MAX_PAGE_SIZE,
    timeWindowHours = REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS,
    enabled = true,
    levels,
  } = options;

  // Calculate start timestamp based on time window
  const startTimestamp = useMemo(() => {
    const now = Date.now();
    const windowMs = timeWindowHours * 60 * 60 * 1000;
    const timestamp = BigInt(now - windowMs);

    return timestamp;
  }, [timeWindowHours]);

  // Create filter code
  const filterInterpreterCode = useMemo(() => {
    if (!pipelineId) {
      return '';
    }
    const code = createPipelineLogFilter(pipelineId, levels);
    const sanitized = sanitizeString(code);
    const encoded = encodeBase64(sanitized);

    return encoded;
  }, [pipelineId, levels]);

  const streamResult = useListMessagesStream({
    topic: REDPANDA_CONNECT_LOGS_TOPIC,
    startOffset: StartOffset.TIMESTAMP,
    startTimestamp,
    partitionId: -1,
    maxResults,
    filterInterpreterCode,
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
    enabled: enabled && !!pipelineId,
  });

  // Parse messages into structured logs
  const logs = useMemo(() => streamResult.messages.map(parsePipelineLog), [streamResult.messages]);

  return {
    ...streamResult,
    logs,
    rawMessages: streamResult.messages,
  };
};

/**
 * Filter logs by scope.
 */
export const filterLogsByScope = (logs: ParsedPipelineLog[], scope: PipelineLogScope): ParsedPipelineLog[] =>
  logs.filter((log) => log.scope === scope);

/**
 * Filter logs by level.
 */
export const filterLogsByLevel = (logs: ParsedPipelineLog[], levels: LogLevel[]): ParsedPipelineLog[] =>
  logs.filter((log) => log.level && levels.includes(log.level));

/**
 * Get issue counts from parsed logs.
 */
export const getLogIssueCounts = (
  logs: ParsedPipelineLog[]
): {
  warnings: number;
  errors: number;
} => {
  let warnings = 0;
  let errors = 0;

  for (const log of logs) {
    if (log.level === 'WARN') {
      warnings += 1;
    } else if (log.level === 'ERROR') {
      errors += 1;
    }
  }

  return { warnings, errors };
};

/**
 * Get scoped issue counts from parsed logs.
 */
export const getScopedLogIssueCounts = (
  logs: ParsedPipelineLog[]
): {
  input: { warnings: number; errors: number };
  output: { warnings: number; errors: number };
  root: { warnings: number; errors: number };
  total: { warnings: number; errors: number };
} => {
  const counts = {
    input: { warnings: 0, errors: 0 },
    output: { warnings: 0, errors: 0 },
    root: { warnings: 0, errors: 0 },
    total: { warnings: 0, errors: 0 },
  };

  for (const log of logs) {
    if (log.level === 'WARN') {
      counts[log.scope].warnings += 1;
      counts.total.warnings += 1;
    } else if (log.level === 'ERROR') {
      counts[log.scope].errors += 1;
      counts.total.errors += 1;
    }
  }

  return counts;
};
