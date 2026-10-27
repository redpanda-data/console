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
import { Code, ConnectError } from '@connectrpc/connect';
import { useQuery as useTanstackQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { NO_LIVED_CACHE_STALE_TIME, ONE_MINUTE, ONE_SECOND } from 'react-query/react-query.utils';
import { toast as sonnerToast } from 'sonner';

import { config as appConfig } from '../../config';
import { PayloadEncoding } from '../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  ListMessagesRequestSchema,
  type ListMessagesResponse,
  type ListMessagesResponse_DataMessage,
  type ListMessagesResponse_ProgressMessage,
} from '../../protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import type { TopicMessage } from '../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../state/ui';
import { sanitizeString } from '../../utils/filter-helper';
import { convertListMessageData } from '../../utils/message-converters';
import { encodeBase64 } from '../../utils/utils';

const LOGS_TOPIC = '__redpanda.connect.logs';
const LIVE_MAX_RESULTS = 1000;
const HISTORY_MAX_RESULTS = 1000;
const LIVE_TIMEOUT_MS = 30 * ONE_MINUTE;
// Reads at most HISTORY_MAX_RESULTS per partition, so a healthy search is well under a second.
const HISTORY_TIMEOUT_MS = 15 * ONE_SECOND;
const FLUSH_INTERVAL_MS = 200;
/**
 * Sliding-window cap for the live-tail log buffer. A live stream runs for up to 30 minutes
 * and `flushMessages` prepends every batch with no limit, so without a cap the reducer's
 * `messages` array would grow unbounded for the whole window on a long-lived/backgrounded tab.
 * Newest-first means the most recent entries are kept.
 */
export const MAX_LIVE_LOG_MESSAGES = 5000;

type UseLogSearchOptions = {
  pipelineId: string;
  live: boolean;
  enabled: boolean;
  /** When true, filters by pipelineId client-side (serverless has no pushdown filters). Defaults to true. */
  serverless?: boolean;
};

type SearchProgress = {
  bytesConsumed: number;
  messagesConsumed: number;
};

type UseLogSearchReturn = {
  messages: TopicMessage[];
  phase: string | null;
  error: string | null;
  progress: SearchProgress;
  refresh: () => void;
};

const logHistoryKey = (pipelineId: string) => ['log-history', pipelineId] as const;

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for live mode refresh
const noop = () => {};

// Serverful clusters filter by pipelineId with a pushdown filter; serverless has none.
function logsFilterCode(pipelineId: string, serverless: boolean): string {
  return serverless ? '' : encodeBase64(sanitizeString(`return key == "${pipelineId}";`));
}

function buildRequest(pipelineId: string, live: boolean, serverless: boolean) {
  return create(ListMessagesRequestSchema, {
    topic: LOGS_TOPIC,
    partitionId: -1,
    includeOriginalRawPayload: false,
    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
    filterInterpreterCode: logsFilterCode(pipelineId, serverless),
    // History starts at high-water-mark - maxResults so we get the most recent N, not the oldest.
    startOffset: BigInt(live ? PartitionOffsetOrigin.End : PartitionOffsetOrigin.EndMinusResults),
    startTimestamp: 0n,
    maxResults: live ? LIVE_MAX_RESULTS : HISTORY_MAX_RESULTS,
  });
}

// The logs topic is created by the first pipeline that logs, so until then there is nothing to find.
const isMissingLogsTopic = (message: string) => message.includes('UNKNOWN_TOPIC_OR_PARTITION');

function describeHistoryError(error: Error): string {
  if (ConnectError.from(error).code === Code.DeadlineExceeded) {
    return 'The log search timed out. Refresh to try again.';
  }
  return error.message;
}

function shouldIncludeMessage(msg: TopicMessage, pipelineId: string, serverless: boolean): boolean {
  // Serverful clusters filter by pipelineId via server-side pushdown; serverless filters here.
  if (!serverless) {
    return true;
  }
  return msg.keyJson === pipelineId;
}

function toSearchProgress(p: ListMessagesResponse_ProgressMessage): SearchProgress {
  return { bytesConsumed: Number(p.bytesConsumed), messagesConsumed: Number(p.messagesConsumed) };
}

function collectPipelineMessage(
  data: ListMessagesResponse_DataMessage,
  pipelineId: string,
  serverless: boolean,
  buffer: TopicMessage[] | null
) {
  const msg = convertListMessageData(data);
  if (shouldIncludeMessage(msg, pipelineId, serverless)) {
    buffer?.push(msg);
  }
}

// History streaming (extracted for React Compiler compatibility).

type HistoryStreamOpts = {
  pipelineId: string;
  serverless: boolean;
  signal: AbortSignal;
  messagesRef: React.RefObject<TopicMessage[] | null>;
  progressRef: React.MutableRefObject<SearchProgress>;
  setPhase: React.Dispatch<React.SetStateAction<string | null>>;
};

// A missing logs topic is expected before any pipeline has logged, so only other failures are toasted.
function historyStreamError(errMsg: string): Error {
  if (!isMissingLogsTopic(errMsg)) {
    sonnerToast.error('Failed to search pipeline logs', { description: errMsg });
  }
  return new Error(errMsg);
}

function handleHistoryMessage(res: ListMessagesResponse, opts: HistoryStreamOpts) {
  switch (res.controlMessage.case) {
    case 'data':
      collectPipelineMessage(res.controlMessage.value, opts.pipelineId, opts.serverless, opts.messagesRef.current);
      break;
    case 'progress':
      opts.progressRef.current = toSearchProgress(res.controlMessage.value);
      break;
    case 'phase':
      opts.setPhase(res.controlMessage.value.phase);
      break;
    case 'done':
      opts.setPhase(null);
      break;
    case 'error':
      throw historyStreamError(res.controlMessage.value.message);
    default:
      break;
  }
}

type ConsoleClient = NonNullable<typeof appConfig.consoleClient>;

async function streamHistory(client: ConsoleClient, opts: HistoryStreamOpts) {
  const req = buildRequest(opts.pipelineId, false, opts.serverless);
  for await (const res of client.listMessages(req, {
    signal: opts.signal,
    timeoutMs: HISTORY_TIMEOUT_MS,
  })) {
    if (opts.signal.aborted) {
      break;
    }
    handleHistoryMessage(res, opts);
  }
}

// No logs topic yet means there are no logs to show; anything else is a real failure.
function settleHistoryFailure(e: unknown, setPhase: HistoryStreamOpts['setPhase']): TopicMessage[] {
  setPhase(null);
  if (e instanceof Error && isMissingLogsTopic(e.message)) {
    return [];
  }
  throw e;
}

async function runHistoryStream(opts: HistoryStreamOpts) {
  const client = appConfig.consoleClient;
  if (!client) {
    throw new Error('Console client not configured');
  }

  try {
    await streamHistory(client, opts);
  } catch (e) {
    return settleHistoryFailure(e, opts.setPhase);
  }

  opts.setPhase(null);
  return opts.messagesRef.current ?? [];
}

const ZERO_PROGRESS: SearchProgress = { bytesConsumed: 0, messagesConsumed: 0 };

function useLogHistory(opts: { pipelineId: string; serverless: boolean; enabled: boolean }) {
  const messagesRef = useRef<TopicMessage[]>([]);
  const progressRef = useRef<SearchProgress>(ZERO_PROGRESS);
  const [streamingMessages, setStreamingMessages] = useState<TopicMessage[]>([]);
  const [progress, setProgress] = useState<SearchProgress>(ZERO_PROGRESS);
  const [phase, setPhase] = useState<string | null>(null);

  // Flush ref to state on an interval while streaming.
  useEffect(() => {
    if (!phase) {
      return;
    }
    const interval = setInterval(() => {
      setStreamingMessages([...(messagesRef.current ?? [])]);
      setProgress({ ...progressRef.current });
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase]);

  const query = useTanstackQuery<TopicMessage[]>({
    queryKey: logHistoryKey(opts.pipelineId),
    queryFn: ({ signal }) => {
      messagesRef.current = [];
      progressRef.current = ZERO_PROGRESS;
      setPhase('Searching...');
      setStreamingMessages([]);
      setProgress(ZERO_PROGRESS);

      return runHistoryStream({
        pipelineId: opts.pipelineId,
        serverless: opts.serverless,
        signal,
        messagesRef,
        progressRef,
        setPhase,
      });
    },
    enabled: opts.enabled,
    staleTime: NO_LIVED_CACHE_STALE_TIME,
    gcTime: 5 * ONE_MINUTE,
    refetchOnWindowFocus: false,
    // A retried timeout doubles the wait; Refresh is the retry.
    retry: false,
  });

  // Incremental messages while streaming, query data once resolved; newest-first to match live tail.
  const messages = useMemo(() => (query.data ?? streamingMessages).toReversed(), [query.data, streamingMessages]);

  return {
    messages,
    phase,
    progress,
    error: query.error ? describeHistoryError(query.error) : null,
    refetch: query.refetch,
  };
}

type LiveState = {
  messages: TopicMessage[];
  phase: string | null;
  error: string | null;
  progress: SearchProgress;
};

type LiveAction =
  | { type: 'reset' }
  | { type: 'start' }
  | { type: 'flushMessages'; msgs: TopicMessage[] }
  | { type: 'setPhase'; phase: string }
  | { type: 'setProgress'; progress: SearchProgress }
  | { type: 'setError'; error: string }
  | { type: 'done' }
  | { type: 'noClient' };

export const LIVE_INITIAL_STATE: LiveState = { messages: [], phase: null, error: null, progress: ZERO_PROGRESS };

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case 'reset':
      return LIVE_INITIAL_STATE;
    case 'start':
      return { messages: [], phase: 'Searching...', error: null, progress: ZERO_PROGRESS };
    case 'flushMessages': {
      if (action.msgs.length === 0) {
        return state;
      }
      // Newest message first; cap to a sliding window so a 30-minute live tail cannot grow
      // the reducer buffer without bound on a long-lived tab.
      const messages = [...action.msgs.toReversed(), ...state.messages];
      return {
        ...state,
        messages: messages.length > MAX_LIVE_LOG_MESSAGES ? messages.slice(0, MAX_LIVE_LOG_MESSAGES) : messages,
      };
    }
    case 'setPhase':
      return { ...state, phase: action.phase };
    case 'setProgress':
      return { ...state, progress: action.progress };
    case 'setError':
      return { ...state, error: action.error, phase: null };
    case 'done':
      return { ...state, phase: null };
    case 'noClient':
      return { messages: [], error: 'Console client not configured', phase: null, progress: ZERO_PROGRESS };
    default:
      return state;
  }
}

type LiveStreamOpts = {
  client: ConsoleClient;
  req: ReturnType<typeof buildRequest>;
  abortController: AbortController;
  pipelineId: string;
  serverless: boolean;
  isMountedRef: React.RefObject<boolean | null>;
  pendingRef: React.RefObject<TopicMessage[] | null>;
  dispatch: React.Dispatch<LiveAction>;
};

function reportLiveError(errMsg: string, dispatch: React.Dispatch<LiveAction>) {
  sonnerToast.error('Failed to search pipeline logs', { description: errMsg });
  dispatch({ type: 'setError', error: errMsg });
}

function handleLiveMessage(res: ListMessagesResponse, opts: LiveStreamOpts) {
  if (!opts.isMountedRef.current) {
    return;
  }
  switch (res.controlMessage.case) {
    case 'phase':
      opts.dispatch({ type: 'setPhase', phase: res.controlMessage.value.phase });
      break;
    case 'progress':
      opts.dispatch({ type: 'setProgress', progress: toSearchProgress(res.controlMessage.value) });
      break;
    case 'data':
      collectPipelineMessage(res.controlMessage.value, opts.pipelineId, opts.serverless, opts.pendingRef.current);
      break;
    case 'done':
      opts.dispatch({ type: 'done' });
      break;
    case 'error':
      reportLiveError(res.controlMessage.value.message, opts.dispatch);
      break;
    default:
      break;
  }
}

async function streamLive(opts: LiveStreamOpts) {
  for await (const res of opts.client.listMessages(opts.req, {
    signal: opts.abortController.signal,
    timeoutMs: LIVE_TIMEOUT_MS,
  })) {
    if (opts.abortController.signal.aborted) {
      break;
    }
    handleLiveMessage(res, opts);
  }
}

async function runLiveStream(opts: LiveStreamOpts) {
  try {
    await streamLive(opts);
  } catch (e) {
    // An aborted tail was closed on purpose; there is nothing to report.
    if (!opts.abortController.signal.aborted && opts.isMountedRef.current) {
      reportLiveError(e instanceof Error ? e.message : 'Unknown error', opts.dispatch);
    }
  } finally {
    if (opts.isMountedRef.current && !opts.abortController.signal.aborted) {
      opts.dispatch({ type: 'done' });
    }
  }
}

type LiveRefs = {
  abortControllerRef: React.RefObject<AbortController | null>;
  isMountedRef: React.RefObject<boolean | null>;
  pendingRef: React.RefObject<TopicMessage[]>;
};

function stopLiveStream(refs: LiveRefs) {
  refs.abortControllerRef.current?.abort();
  refs.pendingRef.current = [];
}

// Opens a fresh tail in place of any earlier one; returns its controller, or null without a client.
function startLiveStream(
  opts: { pipelineId: string; serverless: boolean },
  refs: LiveRefs,
  dispatch: React.Dispatch<LiveAction>
): AbortController | null {
  stopLiveStream(refs);
  const abortController = new AbortController();
  refs.abortControllerRef.current = abortController;

  dispatch({ type: 'start' });

  const client = appConfig.consoleClient;
  if (!client) {
    dispatch({ type: 'noClient' });
    return null;
  }

  // runLiveStream owns rejection reporting and cancellation; the hook owns only its controller.
  void runLiveStream({
    client,
    req: buildRequest(opts.pipelineId, true, opts.serverless),
    abortController,
    pipelineId: opts.pipelineId,
    serverless: opts.serverless,
    isMountedRef: refs.isMountedRef,
    pendingRef: refs.pendingRef,
    dispatch,
  });
  return abortController;
}

// Tracks whether the hook is mounted, and aborts whichever tail is still open on unmount.
function useLiveMountedRef(abortControllerRef: LiveRefs['abortControllerRef']) {
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, [abortControllerRef]);
  return isMountedRef;
}

function flushPendingMessages(pendingRef: LiveRefs['pendingRef'], dispatch: React.Dispatch<LiveAction>) {
  const pending = pendingRef.current;
  if (pending.length > 0) {
    const batch = pending.splice(0);
    dispatch({ type: 'flushMessages', msgs: batch });
  }
}

// Flush pending messages to state on an interval.
function useLivePendingFlush(
  enabled: boolean,
  pendingRef: LiveRefs['pendingRef'],
  dispatch: React.Dispatch<LiveAction>
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const interval = setInterval(() => flushPendingMessages(pendingRef, dispatch), FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, pendingRef, dispatch]);
}

function useLogLive(opts: { pipelineId: string; serverless: boolean; enabled: boolean }): LiveState {
  const [state, dispatch] = useReducer(liveReducer, LIVE_INITIAL_STATE);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useLiveMountedRef(abortControllerRef);
  const pendingRef = useRef<TopicMessage[]>([]);

  useLivePendingFlush(opts.enabled, pendingRef, dispatch);

  useEffect(() => {
    const refs = { abortControllerRef, isMountedRef, pendingRef };
    if (!opts.enabled) {
      stopLiveStream(refs);
      dispatch({ type: 'reset' });
      return;
    }

    const abortController = startLiveStream(
      { pipelineId: opts.pipelineId, serverless: opts.serverless },
      refs,
      dispatch
    );
    if (!abortController) {
      return;
    }
    return () => {
      abortController.abort();
    };
  }, [opts.enabled, opts.pipelineId, opts.serverless, isMountedRef]);

  return state;
}

/** History and tail can both hold a message written as the tail opened; keeps the first of each. */
function withoutRepeats(messages: TopicMessage[]): TopicMessage[] {
  const seen = new Set<string>();
  return messages.filter((msg) => {
    const id = `${msg.partitionID}:${msg.offset}`;
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

export function useLogSearch({
  pipelineId,
  live,
  enabled,
  serverless = true,
}: UseLogSearchOptions): UseLogSearchReturn {
  // Stays on in live mode: the tail starts at the end, so history is what it shows before anything new.
  const history = useLogHistory({
    pipelineId,
    serverless,
    enabled,
  });

  const liveResult = useLogLive({
    pipelineId,
    serverless,
    enabled: enabled && live,
  });

  // Re-read on entering live mode, or logs written since the last search fall between the two; and on
  // leaving it, since the tail's messages go with it.
  const { messages: historyMessages, refetch: refetchHistory } = history;
  const wasLive = useRef(live);
  useEffect(() => {
    const leftLive = wasLive.current && !live;
    wasLive.current = live;
    if (enabled && (live || leftLive)) {
      refetchHistory();
    }
  }, [enabled, live, refetchHistory]);

  const liveMessages = liveResult.messages;
  const messages = useMemo(
    () => (live ? withoutRepeats([...liveMessages, ...historyMessages]) : historyMessages),
    [live, liveMessages, historyMessages]
  );

  return {
    messages,
    // The tail stays open until it is turned off, so only the history read counts as searching.
    phase: history.phase,
    progress: history.progress,
    // Refresh is off while live, so a failed history read leaves the tail showing on its own.
    error: live ? liveResult.error : history.error,
    refresh: live ? noop : refetchHistory,
  };
}
