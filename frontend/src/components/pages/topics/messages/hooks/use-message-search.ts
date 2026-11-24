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
import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { config as appConfig } from '../../../../../config';
import type { PayloadEncoding } from '../../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  type ListMessagesRequest,
  ListMessagesRequestSchema,
  type ListMessagesResponse,
  type ListMessagesResponse_DataMessage,
  type ListMessagesResponse_ErrorMessage,
  type ListMessagesResponse_PhaseMessage,
  type ListMessagesResponse_ProgressMessage,
  type ListMessagesResponse_StreamCompletedMessage,
} from '../../../../../protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../../../../state/ui';
import { appendWithSlackCap } from '../../../../../utils/bounded-array';
import { convertListMessageData } from '../../../../../utils/message-converters';
import { messageKey } from '../utils/message-key';

const LIVE_BUFFER_MAX = 50_000;
const LIVE_BUFFER_SLACK = 1024;

const PAGED_BUFFER_MAX = 5000;
const PAGED_BUFFER_SLACK = 256;

const FLUSH_INTERVAL_MS = 200;

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
  /** '' resolves the topic's context, '.' forces the default. */
  schemaContext?: string;
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

const buildListMessagesRequest = (topicName: string, params: MessageSearchParams, pageToken = '') =>
  create(ListMessagesRequestSchema, {
    topic: topicName,
    startOffset: BigInt(params.startOffset),
    startTimestamp: BigInt(params.startTimestamp),
    partitionId: params.partitionId,
    maxResults: params.maxResults,
    pageToken,
    pageSize: params.pageSize ?? 0,
    filterInterpreterCode: params.filterInterpreterCode,
    includeOriginalRawPayload: params.includeRawPayload ?? false,
    ignoreMaxSizeLimit: params.ignoreSizeLimit ?? false,
    keyDeserializer: params.keyDeserializer,
    valueDeserializer: params.valueDeserializer,
    schemaContext: params.schemaContext ?? '',
  });

type StreamStats = {
  bytesConsumed: number;
  totalMessagesConsumed: number;
  elapsedMs: number | null;
  nextPageToken: string | null;
};

type ConsoleClient = NonNullable<typeof appConfig.consoleClient>;
type ControlMessage = ListMessagesResponse['controlMessage'];
type Timer = ReturnType<typeof setTimeout>;
type RunOptions = { live?: boolean; append?: boolean; pageToken?: string };

type SearchSession = {
  buffer: TopicMessage[];
  pendingNewKeys: Set<string>;
  flushTimer: Timer | null;
  newKeysClearTimer: Timer | null;
  abortController: AbortController | null;
  lastParams: MessageSearchParams | null;
  trackNew: boolean;
};

const createSearchSession: () => SearchSession = () => ({
  buffer: [],
  pendingNewKeys: new Set(),
  flushTimer: null,
  newKeysClearTimer: null,
  abortController: null,
  lastParams: null,
  trackNew: false,
});

type SearchSetters = {
  setMessages: Dispatch<SetStateAction<TopicMessage[]>>;
  setNewKeys: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setPhase: Dispatch<SetStateAction<MessageSearchPhase>>;
  setBackendPhase: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<Error | null>>;
  setStats: Dispatch<SetStateAction<StreamStats>>;
  setIsLoadingMore: Dispatch<SetStateAction<boolean>>;
};

type StreamRun = {
  session: SearchSession;
  setters: SearchSetters;
  abortController: AbortController;
  isLongLived: boolean;
  startTime: number;
  pendingBackendError: Error | null;
  sawDone: boolean;
};

const requireConsoleClient = () => {
  const client = appConfig.consoleClient;
  if (!client) {
    throw new Error('No console client configured');
  }
  return client;
};

const isLongLivedSearch = (params: MessageSearchParams, live: boolean) =>
  live || params.startOffset === PartitionOffsetOrigin.End || params.filterInterpreterCode !== '';

const abortSession = (session: SearchSession, reason: string) => {
  if (session.abortController) {
    session.abortController.abort(reason);
    session.abortController = null;
  }
};

const clearSessionTimers = (session: SearchSession) => {
  if (session.flushTimer) {
    clearTimeout(session.flushTimer);
  }
  if (session.newKeysClearTimer) {
    clearTimeout(session.newKeysClearTimer);
  }
};

const publishNewKeys = (session: SearchSession, setters: SearchSetters) => {
  const fresh = session.pendingNewKeys;
  session.pendingNewKeys = new Set();
  setters.setNewKeys((prev) => new Set([...prev, ...fresh]));
  if (session.newKeysClearTimer) {
    clearTimeout(session.newKeysClearTimer);
  }
  session.newKeysClearTimer = setTimeout(() => {
    session.newKeysClearTimer = null;
    setters.setNewKeys(new Set());
  }, NEW_KEY_TTL_MS);
};

const flushSession = (session: SearchSession, setters: SearchSetters) => {
  session.flushTimer = null;
  setters.setMessages([...session.buffer]);

  if (session.trackNew && session.pendingNewKeys.size > 0) {
    publishNewKeys(session, setters);
  }
};

const scheduleFlush = (session: SearchSession, setters: SearchSetters) => {
  if (session.flushTimer === null) {
    session.flushTimer = setTimeout(() => flushSession(session, setters), FLUSH_INTERVAL_MS);
  }
};

const clearResults = (session: SearchSession, setters: SearchSetters) => {
  session.buffer = [];
  session.pendingNewKeys = new Set();
  setters.setMessages([]);
  setters.setNewKeys(new Set());
};

const resetRunState = (session: SearchSession, setters: SearchSetters, append: boolean) => {
  if (!append) {
    clearResults(session, setters);
  }
  setters.setError(null);
  setters.setIsLoadingMore(append);
  setters.setPhase('connecting');
  setters.setBackendPhase(null);
  setters.setStats((prev) => ({
    bytesConsumed: 0,
    totalMessagesConsumed: 0,
    elapsedMs: null,
    nextPageToken: append ? prev.nextPageToken : null,
  }));
};

const beginRun: (
  session: SearchSession,
  setters: SearchSetters,
  params: MessageSearchParams,
  options: RunOptions
) => StreamRun = (session, setters, params, options) => {
  abortSession(session, 'stopped by user');
  const abortController = new AbortController();
  session.abortController = abortController;
  session.lastParams = params;
  session.trackNew = options.live === true;
  resetRunState(session, setters, options.append === true);
  return {
    session,
    setters,
    abortController,
    isLongLived: isLongLivedSearch(params, options.live === true),
    startTime: Date.now(),
    pendingBackendError: null,
    sawDone: false,
  };
};

const onPhaseFrame = (value: ListMessagesResponse_PhaseMessage, { setters }: StreamRun) => {
  setters.setBackendPhase(value.phase);
  setters.setPhase('searching');
};

const onProgressFrame = (value: ListMessagesResponse_ProgressMessage, { setters }: StreamRun) => {
  const bytesConsumed = Number(value.bytesConsumed);
  const totalMessagesConsumed = Number(value.messagesConsumed);
  setters.setStats((prev) => ({ ...prev, bytesConsumed, totalMessagesConsumed }));
};

const onDoneFrame = (done: ListMessagesResponse_StreamCompletedMessage, run: StreamRun) => {
  run.sawDone = true;
  const bytesConsumed = Number(done.bytesConsumed);
  const elapsedMs = Number(done.elapsedMs) || Date.now() - run.startTime;
  const nextPageToken = done.nextPageToken || null;
  run.setters.setStats((prev) => ({ ...prev, bytesConsumed, elapsedMs, nextPageToken }));
};

const onErrorFrame = (value: ListMessagesResponse_ErrorMessage, run: StreamRun) => {
  toast.error('Backend error', { description: value.message });
  run.pendingBackendError = new Error(value.message);
};

const onDataFrame = (value: ListMessagesResponse_DataMessage, { session, setters, isLongLived }: StreamRun) => {
  const message = convertListMessageData(value);
  if (isLongLived) {
    appendWithSlackCap(session.buffer, message, LIVE_BUFFER_MAX, LIVE_BUFFER_SLACK);
  } else {
    appendWithSlackCap(session.buffer, message, PAGED_BUFFER_MAX, PAGED_BUFFER_SLACK);
  }
  if (session.trackNew) {
    session.pendingNewKeys.add(messageKey(message));
  }
  setters.setPhase('streaming');
  scheduleFlush(session, setters);
};

const applyControlMessage = (controlMessage: ControlMessage, run: StreamRun) => {
  switch (controlMessage.case) {
    case 'phase':
      return onPhaseFrame(controlMessage.value, run);
    case 'progress':
      return onProgressFrame(controlMessage.value, run);
    case 'done':
      return onDoneFrame(controlMessage.value, run);
    case 'error':
      return onErrorFrame(controlMessage.value, run);
    case 'data':
      return onDataFrame(controlMessage.value, run);
    default:
      break;
  }
};

const promoteUnfinishedBackendError = (run: StreamRun) => {
  const backendError = run.pendingBackendError;
  if (backendError === null || run.sawDone) {
    return null;
  }
  run.setters.setError(backendError);
  return backendError;
};

const failRun = (run: StreamRun, err: unknown) => {
  const streamError = err instanceof Error ? err : new Error(String(err));
  run.setters.setError(streamError);
  return streamError;
};

const settleRun = (session: SearchSession, setters: SearchSetters) => {
  if (session.flushTimer) {
    clearTimeout(session.flushTimer);
  }
  flushSession(session, setters);
  setters.setIsLoadingMore(false);
  setters.setPhase('done');
  setters.setBackendPhase(null);
};

const finalizeRun = ({ session, setters, abortController }: StreamRun) => {
  // WARNING: Old aborts settle on a later microtask; do not let them clear in-progress state for the replacement stream.
  const supersededByNewerRun = session.abortController !== null && session.abortController !== abortController;
  if (session.abortController === abortController) {
    session.abortController = null;
  }
  if (!supersededByNewerRun) {
    settleRun(session, setters);
  }
};

const consumeStream = async (client: ConsoleClient, req: ListMessagesRequest, run: StreamRun) => {
  const { signal } = run.abortController;
  const timeoutMs = run.isLongLived ? LIVE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  try {
    for await (const res of client.listMessages(req, { signal, timeoutMs })) {
      if (signal.aborted) {
        break;
      }
      applyControlMessage(res.controlMessage, run);
    }
    return promoteUnfinishedBackendError(run);
  } catch (err) {
    return signal.aborted ? null : failRun(run, err);
  } finally {
    finalizeRun(run);
  }
};

const fetchLargeMessage = async (client: ConsoleClient, req: ListMessagesRequest) => {
  let loaded: TopicMessage | null = null;
  for await (const res of client.listMessages(req, { timeoutMs: DEFAULT_TIMEOUT_MS })) {
    if (res.controlMessage.case === 'data') {
      loaded = convertListMessageData(res.controlMessage.value);
    }
  }
  if (!loaded) {
    throw new Error("Couldn't load the message content, the response was empty");
  }
  return loaded;
};

const replaceBufferedMessage = (
  session: SearchSession,
  setters: SearchSetters,
  { partitionId, offset }: { partitionId: number; offset: number },
  loaded: TopicMessage
) => {
  const index = session.buffer.findIndex((m) => m.partitionID === partitionId && m.offset === offset);
  if (index === -1) {
    throw new Error('Cannot find the message to replace — results changed since the load started');
  }
  session.buffer[index] = loaded;
  setters.setMessages([...session.buffer]);
};

const EMPTY_STATS: StreamStats = {
  bytesConsumed: 0,
  totalMessagesConsumed: 0,
  elapsedMs: null,
  nextPageToken: null,
};

function useSearchState() {
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [phase, setPhase] = useState<MessageSearchPhase>('idle');
  const [backendPhase, setBackendPhase] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<StreamStats>(EMPTY_STATS);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(new Set());
  const [setters] = useState<SearchSetters>(() => ({
    setMessages,
    setNewKeys,
    setPhase,
    setBackendPhase,
    setError,
    setStats,
    setIsLoadingMore,
  }));
  return { state: { messages, phase, backendPhase, error, stats, isLoadingMore, newKeys }, setters };
}

/**
 * Streaming message search over `ConsoleService.listMessages`.
 *
 * Unlike the legacy `createMessageSearch` engine this surfaces every data frame
 * incrementally (throttled to ~5 flushes/s), which the live-tail UX needs to
 * insert rows and drive the flash animation while the stream is open.
 *
 * Live tail and push-down filters use long-lived requests. An error frame becomes a failed run only if no done frame follows it; a clean end or cancellation does not spend the retry budget.
 *
 * Both live and paged backing buffers are bounded: raw and decoded payloads remain in memory even beyond the on-screen window. Paged trimming discards the end already outside the display window.
 *
 * Re-fetches oversized messages with the limit lifted and replaces the existing row. The last data frame wins.
 */
export function useMessageSearch(topicName: string) {
  const { state, setters } = useSearchState();
  const [session] = useState(createSearchSession);

  const stop = useCallback(() => abortSession(session, 'stopped by user'), [session]);

  const runStream = useCallback(
    async (params: MessageSearchParams, options: RunOptions) => {
      const client = requireConsoleClient();
      const run = beginRun(session, setters, params, options);
      const req = buildListMessagesRequest(topicName, params, options.pageToken);
      const streamError = await consumeStream(client, req, run);
      if (streamError && !run.abortController.signal.aborted) {
        throw streamError;
      }
    },
    [topicName, setters, session]
  );

  const start = useCallback(
    (params: MessageSearchParams, options?: { live?: boolean; append?: boolean }) =>
      runStream(params, { live: options?.live, append: options?.append }),
    [runStream]
  );

  const loadMore = useCallback(
    async (pageSize?: number) => {
      const params = session.lastParams;
      const pageToken = state.stats.nextPageToken;
      if (!(params && pageToken)) {
        return;
      }
      await runStream({ ...params, pageSize: pageSize ?? params.pageSize }, { append: true, pageToken });
    },
    [runStream, state.stats.nextPageToken, session]
  );

  const loadLargeMessage = useCallback(
    async (partitionId: number, offset: number) => {
      const client = requireConsoleClient();
      const params = session.lastParams;
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
        schemaContext: params?.schemaContext,
      });
      const loaded = await fetchLargeMessage(client, req);
      replaceBufferedMessage(session, setters, { partitionId, offset }, loaded);
    },
    [topicName, setters, session]
  );

  useEffect(
    () => () => {
      abortSession(session, 'component unmounted');
      clearSessionTimers(session);
    },
    [session]
  );

  const messageSearchResult: MessageSearchResult = {
    messages: state.messages,
    phase: state.phase,
    backendPhase: state.backendPhase,
    error: state.error,
    bytesConsumed: state.stats.bytesConsumed,
    totalMessagesConsumed: state.stats.totalMessagesConsumed,
    elapsedMs: state.stats.elapsedMs,
    nextPageToken: state.stats.nextPageToken,
    isLoadingMore: state.isLoadingMore,
    newKeys: state.newKeys,
    start,
    stop,
    loadMore,
    loadLargeMessage,
  };
  return messageSearchResult;
}
