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
import { config } from 'config';
import type { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  ListMessagesRequestSchema,
  type ListMessagesResponse,
  type ListMessagesResponse_DataMessage,
  type ListMessagesResponse_ErrorMessage,
  type ListMessagesResponse_ProgressMessage,
  type ListMessagesResponse_StreamCompletedMessage,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Start offset constants for ListMessagesRequest */
export const StartOffset = {
  /** Newest - results (recent messages) */
  RECENT: BigInt(-1),
  /** Oldest offset */
  OLDEST: BigInt(-2),
  /** Newest offset */
  NEWEST: BigInt(-3),
  /** By timestamp */
  TIMESTAMP: BigInt(-4),
} as const;

export type ListMessagesStreamOptions = {
  /** Topic name to fetch messages from */
  topic: string;
  /** Start offset - use StartOffset constants or a specific offset */
  startOffset: bigint;
  /** Start timestamp in milliseconds (only used if startOffset is TIMESTAMP) */
  startTimestamp?: bigint;
  /** Partition ID, -1 for all partitions */
  partitionId?: number;
  /** Maximum number of results to return */
  maxResults?: number;
  /** Base64 encoded JavaScript filter code */
  filterInterpreterCode?: string;
  /** Include troubleshooting data */
  troubleshoot?: boolean;
  /** Include original raw payload */
  includeOriginalRawPayload?: boolean;
  /** Key deserializer encoding */
  keyDeserializer?: PayloadEncoding;
  /** Value deserializer encoding */
  valueDeserializer?: PayloadEncoding;
  /** Ignore maximum payload size limit */
  ignoreMaxSizeLimit?: boolean;
  /** Whether the stream should start automatically */
  enabled?: boolean;
  /** Number of retry attempts on error (default: 0 = no retry) */
  retryCount?: number;
  /** Delay in ms between retry attempts (default: 1000) */
  retryDelay?: number;
};

export type ListMessagesStreamState = {
  /** Accumulated data messages */
  messages: ListMessagesResponse_DataMessage[];
  /** Current phase of the stream */
  phase: string | null;
  /** Progress information */
  progress: ListMessagesResponse_ProgressMessage | null;
  /** Stream completed information */
  done: ListMessagesResponse_StreamCompletedMessage | null;
  /** Error message if the stream failed */
  error: ListMessagesResponse_ErrorMessage | null;
  /** Whether the stream is currently running */
  isStreaming: boolean;
  /** Whether the stream has completed (either successfully or with error) */
  isComplete: boolean;
  /** Current retry attempt (0 = initial attempt) */
  retryAttempt: number;
};

export type ListMessagesStreamResult = ListMessagesStreamState & {
  /** Start the stream */
  start: () => void;
  /** Cancel the stream */
  cancel: () => void;
  /** Reset state and restart the stream */
  reset: () => void;
};

const createInitialState = (): ListMessagesStreamState => ({
  messages: [],
  phase: null,
  progress: null,
  done: null,
  error: null,
  isStreaming: false,
  isComplete: false,
  retryAttempt: 0,
});

/**
 * Create a stable key from stream options for change detection.
 * Only includes options that should trigger a restart when changed.
 */
const createOptionsKey = (options: ListMessagesStreamOptions): string =>
  JSON.stringify({
    topic: options.topic,
    startOffset: options.startOffset.toString(),
    startTimestamp: options.startTimestamp?.toString(),
    partitionId: options.partitionId,
    maxResults: options.maxResults,
    filterInterpreterCode: options.filterInterpreterCode,
    keyDeserializer: options.keyDeserializer,
    valueDeserializer: options.valueDeserializer,
  });

/** Create an error state object */
const createErrorState = (message: string): Partial<ListMessagesStreamState> => ({
  error: {
    message,
    $typeName: 'redpanda.api.console.v1alpha1.ListMessagesResponse.ErrorMessage',
  } as ListMessagesResponse_ErrorMessage,
  isStreaming: false,
  isComplete: true,
});

/**
 * Hook for streaming messages from a Kafka topic using Connect RPC server streaming.
 *
 * @example
 * ```tsx
 * const { messages, isStreaming, start, cancel } = useListMessagesStream({
 *   topic: 'my-topic',
 *   startOffset: StartOffset.RECENT,
 *   maxResults: 100,
 * });
 * ```
 */
export const useListMessagesStream = (options: ListMessagesStreamOptions): ListMessagesStreamResult => {
  const [state, setState] = useState<ListMessagesStreamState>(createInitialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevOptionsKeyRef = useRef<string | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    topic,
    startOffset,
    startTimestamp,
    partitionId = -1,
    maxResults = 100,
    filterInterpreterCode = '',
    troubleshoot = false,
    includeOriginalRawPayload = false,
    keyDeserializer,
    valueDeserializer,
    ignoreMaxSizeLimit = false,
    enabled = true,
    retryCount = 0,
    retryDelay = 1000,
  } = options;

  // Create stable options key for change detection
  const optionsKey = createOptionsKey(options);

  const cancel = useCallback(() => {
    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    // Abort current stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleStreamError = useCallback(
    (err: unknown, attempt: number, scheduleRetry: (nextAttempt: number) => void) => {
      // Handle abort error silently
      if (err instanceof Error && err.name === 'AbortError') {
        setState((prev) => ({ ...prev, isStreaming: false, isComplete: true }));
        return;
      }

      // Check if we should retry
      if (attempt < retryCount) {
        setState((prev) => ({
          ...prev,
          phase: `Retrying (${attempt + 1}/${retryCount})...`,
          retryAttempt: attempt + 1,
        }));
        scheduleRetry(attempt + 1);
        return;
      }

      // No more retries, set error state
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setState((prev) => ({ ...prev, ...createErrorState(message) }));
    },
    [retryCount]
  );

  const startWithRetry = useCallback(
    async (attempt = 0) => {
      const consoleClient = config.consoleClient;
      if (!consoleClient) {
        setState((prev) => ({ ...prev, ...createErrorState('Console client not available') }));
        return;
      }

      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Reset state with retry attempt info
      setState({ ...createInitialState(), isStreaming: true, retryAttempt: attempt });

      // Create abort controller for this stream
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const request = create(ListMessagesRequestSchema, {
        topic,
        startOffset,
        startTimestamp: startTimestamp ?? BigInt(0),
        partitionId,
        maxResults,
        filterInterpreterCode,
        troubleshoot,
        includeOriginalRawPayload,
        keyDeserializer,
        valueDeserializer,
        ignoreMaxSizeLimit,
      });

      try {
        const stream = consoleClient.listMessages(request, { signal: abortController.signal });

        for await (const response of stream) {
          if (abortController.signal.aborted) {
            break;
          }
          processResponse(response, setState);
        }

        setState((prev) => ({ ...prev, isStreaming: false, isComplete: true }));
      } catch (err) {
        handleStreamError(err, attempt, (nextAttempt) => {
          retryTimeoutRef.current = setTimeout(() => startWithRetry(nextAttempt), retryDelay);
        });
      }
    },
    [
      topic,
      startOffset,
      startTimestamp,
      partitionId,
      maxResults,
      filterInterpreterCode,
      troubleshoot,
      includeOriginalRawPayload,
      keyDeserializer,
      valueDeserializer,
      ignoreMaxSizeLimit,
      retryDelay,
      handleStreamError,
    ]
  );

  const start = useCallback(() => {
    cancel();
    startWithRetry(0);
  }, [cancel, startWithRetry]);

  const reset = useCallback(() => {
    // Just call start() - it already handles canceling the previous stream
    // and resetting state before starting a new one
    start();
  }, [start]);

  // Auto-start when enabled or when options change
  useEffect(() => {
    if (!enabled) {
      // If disabled, cancel any running stream
      cancel();
      prevOptionsKeyRef.current = null;
      return;
    }

    // Check if options changed
    const optionsChanged = prevOptionsKeyRef.current !== optionsKey;

    if (optionsChanged) {
      prevOptionsKeyRef.current = optionsKey;
      start();
    }
  }, [enabled, optionsKey, start, cancel]);

  // Cleanup on unmount
  useEffect(() => cancel, [cancel]);

  return {
    ...state,
    start,
    cancel,
    reset,
  };
};

/** Process a streaming response and update state */
const processResponse = (
  response: ListMessagesResponse,
  setState: React.Dispatch<React.SetStateAction<ListMessagesStreamState>>
): void => {
  const { controlMessage } = response;

  switch (controlMessage.case) {
    case 'data':
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, controlMessage.value],
      }));
      break;

    case 'phase':
      setState((prev) => ({
        ...prev,
        phase: controlMessage.value.phase,
      }));
      break;

    case 'progress':
      setState((prev) => ({
        ...prev,
        progress: controlMessage.value,
      }));
      break;

    case 'done':
      setState((prev) => ({
        ...prev,
        done: controlMessage.value,
        isStreaming: false,
        isComplete: true,
      }));
      break;

    case 'error':
      setState((prev) => ({
        ...prev,
        error: controlMessage.value,
        isStreaming: false,
        isComplete: true,
      }));
      break;

    default:
      // Unknown control message type - ignore
      break;
  }
};

/**
 * Helper to decode a KafkaRecordPayload's normalized payload to a string
 */
export const decodePayloadToString = (payload: Uint8Array | undefined): string | null => {
  if (!payload || payload.length === 0) {
    return null;
  }
  try {
    return new TextDecoder().decode(payload);
  } catch {
    return null;
  }
};

/**
 * Helper to parse a KafkaRecordPayload's normalized payload as JSON
 */
export const parsePayloadAsJson = <T = unknown>(payload: Uint8Array | undefined): T | null => {
  const str = decodePayloadToString(payload);
  if (!str) {
    return null;
  }
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
};
