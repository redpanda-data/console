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
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { config as appConfig } from '../../../../../config';
import type { PayloadEncoding } from '../../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { ListMessagesRequestSchema } from '../../../../../protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../../../../state/ui';
import { appendWithSlackCap } from '../../../../../utils/bounded-array';
import { convertListMessageData } from '../../../../../utils/message-converters';
import { messageKey } from '../utils/message-key';

/** Memory bound for live-tail / filtered streams (mirrors the legacy engine's cap). */
const LIVE_BUFFER_MAX = 50_000;
const LIVE_BUFFER_SLACK = 1024;

/** How often buffered stream data is flushed into React state. */
const FLUSH_INTERVAL_MS = 200;

/** How long a freshly arrived row keeps its "new" marker (drives the flash animation). */
const NEW_KEY_TTL_MS = 3000;

const DEFAULT_TIMEOUT_MS = 30 * 1000;
const LIVE_TIMEOUT_MS = 30 * 60 * 1000;

export type MessageSearchParams = {
  startOffset: number;
  startTimestamp: number;
  partitionId: number;
  maxResults: number;
  pageSize?: number;
  /** Combined JS predicate, base64 encoded. Empty string when no JS filters are active. */
  filterInterpreterCode: string;
  keyDeserializer?: PayloadEncoding;
  valueDeserializer?: PayloadEncoding;
  includeRawPayload?: boolean;
  ignoreSizeLimit?: boolean;
};

export type MessageSearchPhase = 'idle' | 'connecting' | 'searching' | 'streaming' | 'done';

export type MessageSearchResult = {
  messages: TopicMessage[];
  phase: MessageSearchPhase;
  /** Raw phase string as reported by the backend (e.g. "Consuming messages"). */
  backendPhase: string | null;
  error: Error | null;
  bytesConsumed: number;
  totalMessagesConsumed: number;
  elapsedMs: number | null;
  nextPageToken: string | null;
  isLoadingMore: boolean;
  /** `partition-offset` ids of rows that arrived within the last few seconds (drives flash). */
  newKeys: ReadonlySet<string>;
  start: (params: MessageSearchParams, options?: { live?: boolean; append?: boolean }) => Promise<void>;
  stop: () => void;
  loadMore: (pageSize?: number) => Promise<void>;
  loadLargeMessage: (partitionId: number, offset: number) => Promise<void>;
};

const buildListMessagesRequest = (topicName: string, params: MessageSearchParams) => {
  const req = create(ListMessagesRequestSchema);
  req.topic = topicName;
  req.startOffset = BigInt(params.startOffset);
  req.startTimestamp = BigInt(params.startTimestamp);
  req.partitionId = params.partitionId;
  req.maxResults = params.maxResults;
  req.pageToken = '';
  req.pageSize = params.pageSize ?? 0;
  req.filterInterpreterCode = params.filterInterpreterCode;
  req.includeOriginalRawPayload = params.includeRawPayload ?? false;
  req.ignoreMaxSizeLimit = params.ignoreSizeLimit ?? false;
  req.keyDeserializer = params.keyDeserializer;
  req.valueDeserializer = params.valueDeserializer;
  return req;
};

type StreamStats = {
  bytesConsumed: number;
  totalMessagesConsumed: number;
  elapsedMs: number | null;
  nextPageToken: string | null;
};

/**
 * Streaming message search over `ConsoleService.listMessages`.
 *
 * Unlike the legacy `createMessageSearch` engine this surfaces every data frame
 * incrementally (throttled to ~5 flushes/s), which the live-tail UX needs to
 * insert rows and drive the flash animation while the stream is open.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stream lifecycle is inherently stateful; split further only if it grows
export function useMessageSearch(topicName: string): MessageSearchResult {
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [phase, setPhase] = useState<MessageSearchPhase>('idle');
  const [backendPhase, setBackendPhase] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<StreamStats>({
    bytesConsumed: 0,
    totalMessagesConsumed: 0,
    elapsedMs: null,
    nextPageToken: null,
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(new Set());

  const bufferRef = useRef<TopicMessage[]>([]);
  const pendingNewKeysRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newKeysClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastParamsRef = useRef<MessageSearchParams | null>(null);
  const trackNewRef = useRef(false);

  const flush = useCallback(() => {
    flushTimerRef.current = null;
    setMessages([...bufferRef.current]);

    if (trackNewRef.current && pendingNewKeysRef.current.size > 0) {
      const fresh = pendingNewKeysRef.current;
      pendingNewKeysRef.current = new Set();
      setNewKeys((prev) => new Set([...prev, ...fresh]));
      if (newKeysClearTimerRef.current) {
        clearTimeout(newKeysClearTimerRef.current);
      }
      newKeysClearTimerRef.current = setTimeout(() => {
        newKeysClearTimerRef.current = null;
        setNewKeys(new Set());
      }, NEW_KEY_TTL_MS);
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current === null) {
      flushTimerRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
    }
  }, [flush]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('stopped by user');
      abortControllerRef.current = null;
    }
  }, []);

  const runStream = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one switch per control-message frame kind
    async (params: MessageSearchParams, options: { live?: boolean; append?: boolean; pageToken?: string }) => {
      const client = appConfig.consoleClient;
      if (!client) {
        throw new Error('No console client configured');
      }

      // Abort any in-flight stream before starting a new one
      stop();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const { signal } = abortController;

      lastParamsRef.current = params;
      // Live tail flashes every arriving row; loadMore appends without flashing.
      trackNewRef.current = options.live === true;

      if (!options.append) {
        bufferRef.current = [];
        pendingNewKeysRef.current = new Set();
        setMessages([]);
        setNewKeys(new Set());
      }
      setError(null);
      setIsLoadingMore(options.append === true);
      setPhase('connecting');
      setBackendPhase(null);
      setStats((prev) => ({
        bytesConsumed: 0,
        totalMessagesConsumed: 0,
        elapsedMs: null,
        nextPageToken: options.append ? prev.nextPageToken : null,
      }));

      const req = buildListMessagesRequest(topicName, params);
      if (options.pageToken) {
        req.pageToken = options.pageToken;
      }

      // Tracks whether this run actually failed, as opposed to completing (or being
      // aborted) cleanly — callers that auto-restart (live tail) must only do so on a
      // clean completion, never in response to a real failure. A backend `error` control
      // frame is as much a failure as a thrown/rejected stream: both make `start()` reject.
      let streamError: Error | null = null;

      // Live tail and push-down filters keep the stream open (backend semantics),
      // so those runs get the long timeout — same rule as the legacy engine.
      const isLongLived =
        options.live === true ||
        params.startOffset === PartitionOffsetOrigin.End ||
        params.filterInterpreterCode !== '';
      const timeoutMs = isLongLived ? LIVE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
      const startTime = Date.now();

      try {
        for await (const res of client.listMessages(req, { signal, timeoutMs })) {
          if (signal.aborted) {
            break;
          }
          const controlMessage = res.controlMessage;
          switch (controlMessage.case) {
            case 'phase':
              setBackendPhase(controlMessage.value.phase);
              setPhase('searching');
              break;
            case 'progress': {
              const bytesConsumed = Number(controlMessage.value.bytesConsumed);
              const totalMessagesConsumed = Number(controlMessage.value.messagesConsumed);
              setStats((prev) => ({ ...prev, bytesConsumed, totalMessagesConsumed }));
              break;
            }
            case 'done': {
              const done = controlMessage.value;
              const bytesConsumed = Number(done.bytesConsumed);
              const elapsedMs = Number(done.elapsedMs) || Date.now() - startTime;
              const nextPageToken = done.nextPageToken || null;
              setStats((prev) => ({ ...prev, bytesConsumed, elapsedMs, nextPageToken }));
              break;
            }
            case 'error':
              toast.error('Backend error', { description: controlMessage.value.message });
              streamError = new Error(controlMessage.value.message);
              setError(streamError);
              break;
            case 'data': {
              const message = convertListMessageData(controlMessage.value);
              if (isLongLived) {
                appendWithSlackCap(bufferRef.current, message, LIVE_BUFFER_MAX, LIVE_BUFFER_SLACK);
              } else {
                bufferRef.current.push(message);
              }
              if (trackNewRef.current) {
                pendingNewKeysRef.current.add(messageKey(message));
              }
              setPhase('streaming');
              scheduleFlush();
              break;
            }
            default:
              break;
          }
        }
      } catch (err) {
        if (!signal.aborted) {
          streamError = err instanceof Error ? err : new Error(String(err));
          setError(streamError);
        }
      } finally {
        // An abort's rejection surfaces on a later microtask than the synchronous setup of
        // whichever newer run replaced us (stop() + a fresh AbortController, both synchronous).
        // If someone else now owns abortControllerRef, this run's completion is stale — finalizing
        // here (flush()'s shared bufferRef, phase, backendPhase, isLoadingMore) would clobber the
        // newer run's in-progress state with our own "done". Only finalize when no one else has
        // taken over (ref is still us, or genuinely idle — e.g. an explicit stop with nothing
        // queued to replace it).
        const supersededByNewerRun =
          abortControllerRef.current !== null && abortControllerRef.current !== abortController;
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        if (!supersededByNewerRun) {
          if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
          }
          flush();
          setIsLoadingMore(false);
          setPhase('done');
          setBackendPhase(null);
        }
      }
      // Surfaced via `error` above; reject so a caller that auto-restarts on completion
      // (live tail) can tell a real failure apart from a clean finish and stop looping.
      if (streamError && !signal.aborted) {
        throw streamError;
      }
    },
    [topicName, stop, flush, scheduleFlush]
  );

  const start = useCallback(
    (params: MessageSearchParams, options?: { live?: boolean; append?: boolean }) =>
      runStream(params, { live: options?.live, append: options?.append }),
    [runStream]
  );

  const loadMore = useCallback(
    async (pageSize?: number) => {
      const params = lastParamsRef.current;
      const pageToken = stats.nextPageToken;
      if (!(params && pageToken)) {
        return;
      }
      await runStream({ ...params, pageSize: pageSize ?? params.pageSize }, { append: true, pageToken });
    },
    [runStream, stats.nextPageToken]
  );

  /**
   * Re-fetch a single "payload too large" message with the size limit lifted and
   * swap it into the current result set in place.
   */
  const loadLargeMessage = useCallback(
    async (partitionId: number, offset: number) => {
      const client = appConfig.consoleClient;
      if (!client) {
        throw new Error('No console client configured');
      }
      const params = lastParamsRef.current;
      const req = buildListMessagesRequest(topicName, {
        startOffset: offset,
        startTimestamp: 0,
        partitionId,
        maxResults: 1,
        filterInterpreterCode: '',
        includeRawPayload: true,
        ignoreSizeLimit: true,
        keyDeserializer: params?.keyDeserializer,
        valueDeserializer: params?.valueDeserializer,
      });
      let loaded: TopicMessage | null = null;
      for await (const res of client.listMessages(req, { timeoutMs: DEFAULT_TIMEOUT_MS })) {
        if (res.controlMessage.case === 'data') {
          loaded = convertListMessageData(res.controlMessage.value);
        }
      }
      if (!loaded) {
        throw new Error("Couldn't load the message content, the response was empty");
      }

      const index = bufferRef.current.findIndex((m) => m.partitionID === partitionId && m.offset === offset);
      if (index === -1) {
        throw new Error('Cannot find the message to replace — results changed since the load started');
      }
      bufferRef.current[index] = loaded;
      setMessages([...bufferRef.current]);
    },
    [topicName]
  );

  // Abort the stream and cancel timers on unmount
  useEffect(
    () => () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('component unmounted');
        abortControllerRef.current = null;
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
      if (newKeysClearTimerRef.current) {
        clearTimeout(newKeysClearTimerRef.current);
      }
    },
    []
  );

  return {
    messages,
    phase,
    backendPhase,
    error,
    bytesConsumed: stats.bytesConsumed,
    totalMessagesConsumed: stats.totalMessagesConsumed,
    elapsedMs: stats.elapsedMs,
    nextPageToken: stats.nextPageToken,
    isLoadingMore,
    newKeys,
    start,
    stop,
    loadMore,
    loadLargeMessage,
  };
}
