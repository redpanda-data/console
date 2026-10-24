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

/** Memory bound for live-tail / filtered streams (mirrors the legacy engine's cap). */
const LIVE_BUFFER_MAX = 50_000;
const LIVE_BUFFER_SLACK = 1024;

/**
 * Memory bound for the paged (continuous "Load more") buffer. The display window renders at
 * most DISPLAY_WINDOW_CAP rows, but the backing buffer feeds client filters and path hints,
 * so it keeps a healthy multiple — bounded, though: every appended page retains decoded AND
 * raw payloads, and an unbounded buffer grows past browser memory on a large topic while the
 * UI claims a bounded window. Trimming drops the front, which in both continuous scopes is
 * the end the display window has already trimmed away.
 */
const PAGED_BUFFER_MAX = 5000;
const PAGED_BUFFER_SLACK = 256;

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

/** Mutable bookkeeping shared by every run of one hook instance; lives in a single ref. */
type SearchSession = {
  buffer: TopicMessage[];
  pendingNewKeys: Set<string>;
  flushTimer: Timer | null;
  newKeysClearTimer: Timer | null;
  abortController: AbortController | null;
  lastParams: MessageSearchParams | null;
  /** Live tail flashes every arriving row; loadMore appends without flashing. */
  trackNew: boolean;
};

const createSearchSession = (): SearchSession => ({
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

/** One `listMessages` stream: the session it writes into plus its own frame bookkeeping. */
type StreamRun = {
  session: SearchSession;
  setters: SearchSetters;
  abortController: AbortController;
  /** Live tail and push-down filters keep the stream open (backend semantics). */
  isLongLived: boolean;
  startTime: number;
  /**
   * A backend `error` control frame (e.g. "N partitions offline") doesn't necessarily mean the
   * whole request failed — same rule the legacy engine applies. Only promoted to a real failure
   * if the stream ends without a `done` frame following it.
   */
  pendingBackendError: Error | null;
  sawDone: boolean;
};

const requireConsoleClient = (): ConsoleClient => {
  const client = appConfig.consoleClient;
  if (!client) {
    throw new Error('No console client configured');
  }
  return client;
};

/** Live tail and push-down filters keep the stream open, so those runs get the long timeout — same rule as the legacy engine. */
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

/** Marks the keys collected since the last flush as new, and clears every marker NEW_KEY_TTL_MS later. */
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

/** Aborts any in-flight stream, claims the session for a new run and resets the visible state. */
const beginRun = (
  session: SearchSession,
  setters: SearchSetters,
  params: MessageSearchParams,
  options: RunOptions
): StreamRun => {
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
  // Doesn't necessarily mean the whole request failed (e.g. "N partitions
  // offline") — the stream can still reach `done` normally afterwards.
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

/**
 * The stream ended without ever reaching `done` after a backend error frame — that's the fatal
 * case (e.g. every partition failed); promote it so callers that auto-restart (live tail) can
 * tell it apart from a clean finish.
 */
const promoteUnfinishedBackendError = (run: StreamRun): Error | null => {
  const backendError = run.pendingBackendError;
  if (backendError === null || run.sawDone) {
    return null;
  }
  run.setters.setError(backendError);
  return backendError;
};

const failRun = (run: StreamRun, err: unknown): Error => {
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
  // An abort's rejection surfaces on a later microtask than the synchronous setup of
  // whichever newer run replaced us (stop() + a fresh AbortController, both synchronous).
  // If someone else now owns the session's abortController, this run's completion is stale —
  // finalizing here (the shared buffer flush, phase, backendPhase, isLoadingMore) would clobber
  // the newer run's in-progress state with our own "done". Only finalize when no one else has
  // taken over (still us, or genuinely idle — e.g. an explicit stop with nothing queued to
  // replace it).
  const supersededByNewerRun = session.abortController !== null && session.abortController !== abortController;
  if (session.abortController === abortController) {
    session.abortController = null;
  }
  if (!supersededByNewerRun) {
    settleRun(session, setters);
  }
};

/**
 * Consumes the stream into the session. Resolves with the run's failure — `null` for a clean
 * completion or an abort — so callers that auto-restart (live tail) can tell them apart.
 */
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

/** Re-fetches one message with the size limit lifted; the last data frame wins. */
const fetchLargeMessage = async (client: ConsoleClient, req: ListMessagesRequest): Promise<TopicMessage> => {
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

/** The React state the stream writes into, with its setters bundled for the stream helpers. */
function useSearchState() {
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [phase, setPhase] = useState<MessageSearchPhase>('idle');
  const [backendPhase, setBackendPhase] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<StreamStats>(EMPTY_STATS);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [newKeys, setNewKeys] = useState<ReadonlySet<string>>(new Set());
  // setState functions never change identity, so the bundle is captured once and stays a
  // stable dependency for the callbacks below.
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
 */
export function useMessageSearch(topicName: string): MessageSearchResult {
  const { state, setters } = useSearchState();
  // Lazy, so the session is built once rather than on every render; its identity never changes.
  const [session] = useState(createSearchSession);

  const stop = useCallback(() => abortSession(session, 'stopped by user'), [session]);

  const runStream = useCallback(
    async (params: MessageSearchParams, options: RunOptions) => {
      const client = requireConsoleClient();
      const run = beginRun(session, setters, params, options);
      const req = buildListMessagesRequest(topicName, params, options.pageToken);
      const streamError = await consumeStream(client, req, run);
      // Surfaced via `error` above; reject so a caller that auto-restarts on completion
      // (live tail) can tell a real failure apart from a clean finish and stop looping.
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

  /**
   * Re-fetch a single "payload too large" message with the size limit lifted and
   * swap it into the current result set in place.
   */
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

  // Abort the stream and cancel timers on unmount
  useEffect(
    () => () => {
      abortSession(session, 'component unmounted');
      clearSessionTimers(session);
    },
    [session]
  );

  return {
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
}
