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
import { useQuery as useTanstackQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { NO_LIVED_CACHE_STALE_TIME, ONE_MINUTE, ONE_SECOND } from 'react-query/react-query.utils';
import { toast as sonnerToast } from 'sonner';

import { config as appConfig } from '../../config';
import { PayloadEncoding } from '../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  ListMessagesRequestSchema,
  type ListMessagesResponse,
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
const HISTORY_TIMEOUT_MS = 30 * ONE_SECOND;
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

const LOG_HISTORY_KEY = (pipelineId: string) => ['log-history', pipelineId] as const;

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op for live mode refresh
const noop = () => {};

function buildRequest(pipelineId: string, live: boolean, serverless: boolean) {
  const usesPushdownFilter = !serverless;

  const req = create(ListMessagesRequestSchema);
  req.topic = LOGS_TOPIC;
  req.partitionId = -1;
  req.includeOriginalRawPayload = false;
  req.keyDeserializer = PayloadEncoding.UNSPECIFIED;
  req.valueDeserializer = PayloadEncoding.UNSPECIFIED;

  if (usesPushdownFilter) {
    req.filterInterpreterCode = encodeBase64(sanitizeString(`return key == "${pipelineId}";`));
  } else {
    req.filterInterpreterCode = '';
  }

  if (live) {
    req.startOffset = BigInt(PartitionOffsetOrigin.End);
    req.startTimestamp = 0n;
    req.maxResults = LIVE_MAX_RESULTS;
  } else {
    // Start at high-water-mark - maxResults so we get the most recent N, not the oldest.
    req.startOffset = BigInt(PartitionOffsetOrigin.EndMinusResults);
    req.startTimestamp = 0n;
    req.maxResults = HISTORY_MAX_RESULTS;
  }

  return req;
}

function shouldIncludeMessage(msg: TopicMessage, pipelineId: string, serverless: boolean): boolean {
  // Serverful clusters filter by pipelineId via server-side pushdown; serverless filters here.
  if (!serverless) {
    return true;
  }
  return msg.keyJson === pipelineId;
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

function handleHistoryMessage(res: ListMessagesResponse, opts: HistoryStreamOpts) {
  switch (res.controlMessage.case) {
    case 'data': {
      const msg = convertListMessageData(res.controlMessage.value);
      if (shouldIncludeMessage(msg, opts.pipelineId, opts.serverless)) {
        opts.messagesRef.current?.push(msg);
      }
      break;
    }
    case 'progress': {
      const p = res.controlMessage.value;
      opts.progressRef.current = {
        bytesConsumed: Number(p.bytesConsumed),
        messagesConsumed: Number(p.messagesConsumed),
      };
      break;
    }
    case 'phase':
      opts.setPhase(res.controlMessage.value.phase);
      break;
    case 'done':
      opts.setPhase(null);
      break;
    case 'error': {
      const errMsg = res.controlMessage.value.message;
      sonnerToast.error('Failed to search pipeline logs', { description: errMsg });
      throw new Error(errMsg);
    }
    default:
      break;
  }
}

async function runHistoryStream(opts: HistoryStreamOpts) {
  const client = appConfig.consoleClient;
  if (!client) {
    throw new Error('Console client not configured');
  }

  const req = buildRequest(opts.pipelineId, false, opts.serverless);

  try {
    for await (const res of client.listMessages(req, {
      signal: opts.signal,
      timeoutMs: HISTORY_TIMEOUT_MS,
    })) {
      if (opts.signal.aborted) {
        break;
      }
      handleHistoryMessage(res, opts);
    }
  } catch (e) {
    opts.setPhase(null);
    throw e;
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
    queryKey: LOG_HISTORY_KEY(opts.pipelineId),
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
  });

  // Incremental messages while streaming, query data once resolved; newest-first to match live tail.
  const messages = useMemo(() => (query.data ?? streamingMessages).toReversed(), [query.data, streamingMessages]);

  return { messages, phase, progress, error: query.error?.message ?? null, refetch: query.refetch };
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
  client: NonNullable<typeof appConfig.consoleClient>;
  req: ReturnType<typeof buildRequest>;
  abortController: AbortController;
  pipelineId: string;
  serverless: boolean;
  isMountedRef: React.RefObject<boolean | null>;
  pendingRef: React.RefObject<TopicMessage[] | null>;
  dispatch: React.Dispatch<LiveAction>;
};

function handleLiveMessage(res: ListMessagesResponse, opts: LiveStreamOpts) {
  if (!opts.isMountedRef.current) {
    return;
  }
  switch (res.controlMessage.case) {
    case 'phase':
      opts.dispatch({ type: 'setPhase', phase: res.controlMessage.value.phase });
      break;
    case 'progress': {
      const p = res.controlMessage.value;
      opts.dispatch({
        type: 'setProgress',
        progress: { bytesConsumed: Number(p.bytesConsumed), messagesConsumed: Number(p.messagesConsumed) },
      });
      break;
    }
    case 'data': {
      const msg = convertListMessageData(res.controlMessage.value);
      if (shouldIncludeMessage(msg, opts.pipelineId, opts.serverless)) {
        opts.pendingRef.current?.push(msg);
      }
      break;
    }
    case 'done':
      opts.dispatch({ type: 'done' });
      break;
    case 'error': {
      const errMsg = res.controlMessage.value.message;
      sonnerToast.error('Failed to search pipeline logs', { description: errMsg });
      opts.dispatch({ type: 'setError', error: errMsg });
      break;
    }
    default:
      break;
  }
}

async function runLiveStream(opts: LiveStreamOpts) {
  try {
    for await (const res of opts.client.listMessages(opts.req, {
      signal: opts.abortController.signal,
      timeoutMs: LIVE_TIMEOUT_MS,
    })) {
      if (opts.abortController.signal.aborted) {
        break;
      }
      handleLiveMessage(res, opts);
    }
  } catch (e) {
    if (opts.abortController.signal.aborted) {
      return;
    }
    if (opts.isMountedRef.current) {
      const errMsg = e instanceof Error ? e.message : 'Unknown error';
      sonnerToast.error('Failed to search pipeline logs', { description: errMsg });
      opts.dispatch({ type: 'setError', error: errMsg });
    }
  } finally {
    if (opts.isMountedRef.current && !opts.abortController.signal.aborted) {
      opts.dispatch({ type: 'done' });
    }
  }
}

function useLogLive(opts: { pipelineId: string; serverless: boolean; enabled: boolean }): LiveState {
  const [state, dispatch] = useReducer(liveReducer, LIVE_INITIAL_STATE);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const pendingRef = useRef<TopicMessage[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Flush pending messages to state on an interval.
  useEffect(() => {
    if (!opts.enabled) {
      return;
    }
    const interval = setInterval(() => {
      const pending = pendingRef.current;
      if (pending.length > 0) {
        const batch = pending.splice(0);
        dispatch({ type: 'flushMessages', msgs: batch });
      }
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [opts.enabled]);

  useEffect(() => {
    if (!opts.enabled) {
      abortControllerRef.current?.abort();
      pendingRef.current = [];
      dispatch({ type: 'reset' });
      return;
    }

    abortControllerRef.current?.abort();
    pendingRef.current = [];
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    dispatch({ type: 'start' });

    const client = appConfig.consoleClient;
    if (!client) {
      dispatch({ type: 'noClient' });
      return;
    }

    const req = buildRequest(opts.pipelineId, true, opts.serverless);
    runLiveStream({
      client,
      req,
      abortController,
      pipelineId: opts.pipelineId,
      serverless: opts.serverless,
      isMountedRef,
      pendingRef,
      dispatch,
    });

    return () => {
      abortController.abort();
    };
  }, [opts.enabled, opts.pipelineId, opts.serverless]);

  return state;
}

export function useLogSearch({
  pipelineId,
  live,
  enabled,
  serverless = true,
}: UseLogSearchOptions): UseLogSearchReturn {
  const history = useLogHistory({
    pipelineId,
    serverless,
    enabled: enabled && !live,
  });

  const liveResult = useLogLive({
    pipelineId,
    serverless,
    enabled: enabled && live,
  });

  if (live) {
    return {
      messages: liveResult.messages,
      phase: liveResult.phase,
      error: liveResult.error,
      progress: liveResult.progress,
      refresh: noop,
    };
  }

  return {
    messages: history.messages,
    phase: history.phase,
    error: history.error,
    progress: history.progress,
    refresh: history.refetch,
  };
}
