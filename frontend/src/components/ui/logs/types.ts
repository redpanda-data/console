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

import type { ListMessagesResponse_DataMessage } from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';

/**
 * Log levels used in log messages.
 * These match the standard log levels emitted by various systems.
 */
export const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Generic parsed log content structure.
 * Consumers can extend this with additional fields.
 */
export type ParsedLogContent = {
  level?: string;
  path?: string;
  message?: string;
  msg?: string;
  [key: string]: unknown;
};

/**
 * Generic parsed log entry - works with any Kafka message source.
 * This is the base type that all log viewers should accept.
 *
 * @example
 * ```typescript
 * // Pipeline logs extend this with pipeline-specific fields
 * type ParsedPipelineLog = ParsedLogEntry & {
 *   pipelineId: string;
 * };
 * ```
 */
export type ParsedLogEntry = {
  /** Original message from the stream */
  message: ListMessagesResponse_DataMessage;
  /** Unique identifier (e.g., pipelineId, topicName) */
  id: string;
  /** Log level (TRACE, DEBUG, INFO, WARN, ERROR) */
  level: LogLevel | null;
  /** Log path (e.g., root.input, root.output) */
  path: string | null;
  /** Scope derived from path - consumers define what scopes mean */
  scope: string;
  /** Parsed log content */
  content: ParsedLogContent | null;
  /** Timestamp of the message */
  timestamp: bigint;
  /** Offset in the partition */
  offset: bigint;
  /** Partition ID */
  partitionId: number;
};

/**
 * Filter option for faceted filters in log explorer.
 */
export type FilterOption<T extends string = string> = {
  value: T;
  label: string;
};

/**
 * Scope option configuration for log explorer.
 */
export type ScopeOption = FilterOption;

/**
 * Level option configuration for log explorer.
 */
export type LevelOption = FilterOption<LogLevel>;

/**
 * Default level options for log explorers.
 */
export const DEFAULT_LEVEL_OPTIONS: LevelOption[] = LOG_LEVELS.map((level) => ({
  value: level,
  label: level,
}));
