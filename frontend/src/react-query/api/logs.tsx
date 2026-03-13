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
import { useEffect, useReducer, useRef, useState } from 'react';
import { ONE_MINUTE, ONE_SECOND } from 'react-query/react-query.utils';
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

// --- Constants ---

const LOGS_TOPIC = '__redpanda.connect.logs';
const LIVE_MAX_RESULTS = 1000;
const HISTORY_MAX_RESULTS = 1000;
const HISTORY_HOURS = 5;
const LIVE_TIMEOUT_MS = 30 * ONE_MINUTE;
const HISTORY_TIMEOUT_MS = 30 * ONE_SECOND;
const FLUSH_INTERVAL_MS = 200;

// --- Types ---

type UseLogSearchOptions = {
  pipelineId: string;
  live: boolean;
  enabled: boolean;
  /** When true, filters by pipelineId client-side (serverless has no pushdown filters). Defaults to true. */
  serverless?: boolean;
};

type UseLogSearchReturn = {
  messages: TopicMessage[];
  phase: string | null;
  error: string | null;
  refresh: () => void;
};

// --- Helpers ---

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
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - HISTORY_HOURS);
    req.startOffset = BigInt(PartitionOffsetOrigin.Timestamp);
    req.startTimestamp = BigInt(startTime.getTime());
    req.maxResults = HISTORY_MAX_RESULTS;
  }

  return req;
}

function shouldIncludeMessage(msg: TopicMessage, pipelineId: string, serverless: boolean): boolean {
  // Server-side pushdown filter handles pipelineId matching for serverful clusters;
  // serverless clusters need client-side filtering.
  if (!serverless) {
    return true;
  }
  return msg.keyJson === pipelineId;
}

// --- History streaming (extracted for React Compiler compatibility) ---

type HistoryStreamOpts = {
  pipelineId: string;
  serverless: boolean;
  signal: AbortSignal;
  messagesRef: React.RefObject<TopicMessage[]>;
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

// --- useLogHistory: React Query + ref/interval for incremental streaming ---

function useLogHistory(opts: { pipelineId: string; serverless: boolean; enabled: boolean }) {
  const messagesRef = useRef<TopicMessage[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<TopicMessage[]>([]);
  const [phase, setPhase] = useState<string | null>(null);

  // Flush ref to state every 200ms during streaming
  useEffect(() => {
    if (!phase) {
      return;
    }
    const interval = setInterval(() => {
      setStreamingMessages([...(messagesRef.current ?? [])]);
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase]);

  const query = useTanstackQuery<TopicMessage[]>({
    queryKey: LOG_HISTORY_KEY(opts.pipelineId),
    queryFn: ({ signal }) => {
      messagesRef.current = [];
      setPhase('Searching...');
      setStreamingMessages([]);

      return runHistoryStream({
        pipelineId: opts.pipelineId,
        serverless: opts.serverless,
        signal,
        messagesRef,
        setPhase,
      });
    },
    enabled: opts.enabled,
    staleTime: 0,
    gcTime: 5 * ONE_MINUTE,
    refetchOnWindowFocus: false,
  });

  // While streaming, show incremental messages. Once resolved, show query data.
  const messages = query.data ?? streamingMessages;

  return { messages, phase, error: query.error?.message ?? null, refetch: query.refetch };
}

// --- useLogLive: Standalone streaming hook for live tail ---

type LiveState = {
  messages: TopicMessage[];
  phase: string | null;
  error: string | null;
};

type LiveAction =
  | { type: 'reset' }
  | { type: 'start' }
  | { type: 'addMessage'; msg: TopicMessage }
  | { type: 'setPhase'; phase: string }
  | { type: 'setError'; error: string }
  | { type: 'done' }
  | { type: 'noClient' };

const LIVE_INITIAL_STATE: LiveState = { messages: [], phase: null, error: null };

function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case 'reset':
      return LIVE_INITIAL_STATE;
    case 'start':
      return { messages: [], phase: 'Searching...', error: null };
    case 'addMessage':
      return { ...state, messages: [action.msg, ...state.messages] };
    case 'setPhase':
      return { ...state, phase: action.phase };
    case 'setError':
      return { ...state, error: action.error, phase: null };
    case 'done':
      return { ...state, phase: null };
    case 'noClient':
      return { messages: [], error: 'Console client not configured', phase: null };
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
  isMountedRef: React.RefObject<boolean>;
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
    case 'data': {
      const msg = convertListMessageData(res.controlMessage.value);
      if (shouldIncludeMessage(msg, opts.pipelineId, opts.serverless)) {
        opts.dispatch({ type: 'addMessage', msg });
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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!opts.enabled) {
      abortControllerRef.current?.abort();
      dispatch({ type: 'reset' });
      return;
    }

    abortControllerRef.current?.abort();
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
      dispatch,
    });

    return () => {
      abortController.abort();
    };
  }, [opts.enabled, opts.pipelineId, opts.serverless]);

  return state;
}

// --- useLogSearch: Public composition hook ---

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
      refresh: noop,
    };
  }

  return {
    messages: history.messages,
    phase: history.phase,
    error: history.error,
    refresh: history.refetch,
  };
}
