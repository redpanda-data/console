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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StartOffset, useListMessagesStream } from 'react-query/api/messages';
import { REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS, REDPANDA_CONNECT_LOGS_TOPIC } from 'react-query/api/pipeline';
import { sanitizeString } from 'utils/filter-helper';
import { encodeBase64 } from 'utils/utils';

import { type ParsedPipelineLog, parsePipelineLog } from './use-pipeline-logs';
import type { LogLevel } from '../logs/types';

type UsePipelineLogsStreamOptions = {
  /** Pipeline ID to filter logs for */
  pipelineId: string;
  /** Whether to enable streaming (default: true) */
  enabled?: boolean;
  /** Poll interval in milliseconds after stream completion (default: 3000) */
  pollInterval?: number;
  /** Maximum results per batch (default: 100) */
  maxResults?: number;
  /** Time window in hours to look back (default: 5) */
  timeWindowHours?: number;
  /** Filter by log levels */
  levels?: LogLevel[];
};

type UsePipelineLogsStreamResult = {
  /** Accumulated parsed logs (newest first, capped at 500) */
  logs: ParsedPipelineLog[];
  /** New logs buffer for highlight animation */
  newLogs: ParsedPipelineLog[];
  /** Whether currently streaming/polling */
  isStreaming: boolean;
  /** Error if stream failed */
  error: Error | null;
  /** Start/resume streaming */
  start: () => void;
  /** Stop streaming */
  stop: () => void;
  /** Reset state and restart streaming */
  reset: () => void;
};

/**
 * Create a filter code for pipeline logs.
 * Uses the same simple pattern as the working legacy LogsTab filter.
 */
const createPipelineLogFilter = (pipelineId: string, levels?: LogLevel[]): string => {
  // Simple filter matching the working legacy pattern
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
 * Hook for continuous streaming of pipeline logs using polling.
 *
 * This hook wraps useListMessagesStream with polling logic to simulate live-tail behavior.
 * Since the API doesn't support follow mode, we restart the stream after completion with
 * updated offsets to fetch new logs.
 *
 * Key features:
 * - Tracks highest offset per partition to avoid gaps
 * - Deduplicates logs using partition-offset keys
 * - Auto-restarts after completion with pollInterval delay
 * - Accumulates logs sorted DESC (newest first)
 * - Caps at 500 logs to prevent memory issues
 * - Provides newLogs buffer for highlight animation
 *
 * @example
 * ```tsx
 * const { logs, newLogs, isStreaming, reset } = usePipelineLogsStream({
 *   pipelineId: 'my-pipeline',
 *   enabled: true,
 *   pollInterval: 3000,
 * });
 *
 * <LogExplorer
 *   logs={logs}
 *   newLogs={newLogs}
 *   isLoading={isStreaming}
 *   onRefresh={reset}
 * />
 * ```
 */
export const usePipelineLogsStream = (options: UsePipelineLogsStreamOptions): UsePipelineLogsStreamResult => {
  const {
    pipelineId,
    enabled = true,
    pollInterval = 3000,
    maxResults = 100,
    timeWindowHours = REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS,
    levels,
  } = options;

  // Track highest offset per partition for continuous streaming
  const offsetsRef = useRef<Map<number, bigint>>(new Map());

  // Deduplication: track seen partition-offset pairs
  const receivedKeysRef = useRef<Set<string>>(new Set());

  // Accumulated logs (mutable ref to avoid re-renders on every message)
  const logsRef = useRef<ParsedPipelineLog[]>([]);

  // New logs buffer for highlight animation
  const [newLogs, setNewLogs] = useState<ParsedPipelineLog[]>([]);

  // Polling state
  const [isPolling, setIsPolling] = useState(false);
  const [restartTrigger, setRestartTrigger] = useState(0);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate start timestamp and offset
  const startTimestamp = useMemo(() => {
    const now = Date.now();
    const windowMs = timeWindowHours * 60 * 60 * 1000;
    return BigInt(now - windowMs);
  }, [timeWindowHours]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restartTrigger is intentionally used to trigger recalculation
  const startOffset = useMemo(() => {
    if (offsetsRef.current.size === 0) {
      return StartOffset.TIMESTAMP; // Initial: by timestamp
    }
    // Find minimum offset across partitions and resume from next
    const offsets = Array.from(offsetsRef.current.values());
    const minOffset = offsets.reduce((min, curr) => (curr < min ? curr : min), offsets[0]);
    return minOffset + BigInt(1);
  }, [restartTrigger]); // Re-calculate when we restart

  // Create stable key from levels array to avoid unnecessary filter recreation
  const levelsKey = useMemo(() => (levels ? [...levels].sort().join(',') : ''), [levels]);

  // Create filter code
  const filterInterpreterCode = useMemo(() => {
    if (!pipelineId) {
      return '';
    }
    const parsedLevels = levelsKey ? (levelsKey.split(',') as LogLevel[]) : undefined;
    const code = createPipelineLogFilter(pipelineId, parsedLevels);
    const sanitized = sanitizeString(code);
    return encodeBase64(sanitized);
  }, [pipelineId, levelsKey]);

  // Use existing stream hook
  const stream = useListMessagesStream({
    topic: REDPANDA_CONNECT_LOGS_TOPIC,
    startOffset,
    startTimestamp,
    partitionId: -1,
    maxResults,
    filterInterpreterCode,
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
    enabled: isPolling && !!pipelineId,
  });

  // Process new messages
  useEffect(() => {
    if (!stream.messages.length) {
      return;
    }

    const newBatch: ParsedPipelineLog[] = [];

    for (const msg of stream.messages) {
      const key = `${msg.partitionId}-${msg.offset.toString()}`;

      // Skip if already seen
      if (receivedKeysRef.current.has(key)) {
        continue;
      }

      receivedKeysRef.current.add(key);

      // Update offset tracking
      const currentOffset = offsetsRef.current.get(msg.partitionId) ?? BigInt(-1);
      if (msg.offset > currentOffset) {
        offsetsRef.current.set(msg.partitionId, msg.offset);
      }

      newBatch.push(parsePipelineLog(msg));
    }

    if (newBatch.length > 0) {
      // Prepend + sort DESC (newest first) + cap at 500
      logsRef.current = [...newBatch, ...logsRef.current]
        .sort((a, b) => Number(b.timestamp - a.timestamp))
        .slice(0, 500);

      // Update new logs for highlighting
      setNewLogs(newBatch);

      // Clear highlight after 3s
      const timer = setTimeout(() => {
        setNewLogs([]);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [stream.messages]);

  // Schedule next poll when stream completes
  useEffect(() => {
    if (stream.isComplete && isPolling && !stream.error) {
      // Clear any existing timeout
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }

      pollTimeoutRef.current = setTimeout(() => {
        // Trigger restart by incrementing counter (causes startOffset recalculation)
        setRestartTrigger((prev) => prev + 1);
        stream.reset();
      }, pollInterval);
    }

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [stream.isComplete, isPolling, stream.error, pollInterval, stream]);

  // Controls
  const start = useCallback(() => {
    setIsPolling(true);
  }, []);

  const stop = useCallback(() => {
    setIsPolling(false);
    stream.cancel();
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, [stream]);

  const reset = useCallback(() => {
    // Clear all state
    offsetsRef.current.clear();
    receivedKeysRef.current.clear();
    logsRef.current = [];
    setNewLogs([]);
    setRestartTrigger((prev) => prev + 1);

    // Restart stream
    stream.reset();
  }, [stream]);

  // Auto-start on mount if enabled
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
  }, [enabled, start, stop]);

  return {
    logs: logsRef.current,
    newLogs,
    isStreaming: isPolling && stream.isStreaming,
    error: stream.error ? new Error(stream.error.message || 'Stream error') : null,
    start,
    stop,
    reset,
  };
};
