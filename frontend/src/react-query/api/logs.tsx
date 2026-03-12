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
import { useCallback, useEffect, useRef, useState } from 'react';
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
      setStreamingMessages([...messagesRef.current]);
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase]);

  const query = useTanstackQuery<TopicMessage[]>({
    queryKey: LOG_HISTORY_KEY(opts.pipelineId),
    queryFn: async ({ signal }) => {
      messagesRef.current = [];
      setPhase('Searching...');
      setStreamingMessages([]);

      const client = appConfig.consoleClient;
      if (!client) {
        throw new Error('Console client not configured');
      }

      const req = buildRequest(opts.pipelineId, false, opts.serverless);

      try {
        for await (const res of client.listMessages(req, {
          signal,
          timeoutMs: HISTORY_TIMEOUT_MS,
        })) {
          if (signal?.aborted) {
            break;
          }

          switch (res.controlMessage.case) {
            case 'data': {
              const msg = convertListMessageData(res.controlMessage.value);
              if (shouldIncludeMessage(msg, opts.pipelineId, opts.serverless)) {
                messagesRef.current.push(msg);
              }
              break;
            }
            case 'phase':
              setPhase(res.controlMessage.value.phase);
              break;
            case 'done':
              setPhase(null);
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
      } finally {
        setPhase(null);
      }

      return messagesRef.current;
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

type LiveStreamOpts = {
  client: NonNullable<typeof appConfig.consoleClient>;
  req: ReturnType<typeof buildRequest>;
  abortController: AbortController;
  pipelineId: string;
  serverless: boolean;
  isMountedRef: React.RefObject<boolean>;
  setMessages: React.Dispatch<React.SetStateAction<TopicMessage[]>>;
  setPhase: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

function handleLiveMessage(res: ListMessagesResponse, opts: LiveStreamOpts) {
  switch (res.controlMessage.case) {
    case 'phase':
      if (opts.isMountedRef.current) {
        opts.setPhase(res.controlMessage.value.phase);
      }
      break;
    case 'data': {
      const msg = convertListMessageData(res.controlMessage.value);
      if (shouldIncludeMessage(msg, opts.pipelineId, opts.serverless) && opts.isMountedRef.current) {
        opts.setMessages((prev) => [msg, ...prev]);
      }
      break;
    }
    case 'done':
      if (opts.isMountedRef.current) {
        opts.setPhase(null);
      }
      break;
    case 'error':
      if (opts.isMountedRef.current) {
        const errMsg = res.controlMessage.value.message;
        sonnerToast.error('Failed to search pipeline logs', { description: errMsg });
        opts.setError(errMsg);
      }
      break;
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
      opts.setError(errMsg);
      opts.setPhase(null);
    }
  } finally {
    if (opts.isMountedRef.current && !opts.abortController.signal.aborted) {
      opts.setPhase(null);
    }
  }
}

function useLogLive(opts: { pipelineId: string; serverless: boolean; enabled: boolean }): {
  messages: TopicMessage[];
  phase: string | null;
  error: string | null;
} {
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setMessages([]);
      setPhase(null);
      setError(null);
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setPhase('Searching...');
    setError(null);
    setMessages([]);

    const client = appConfig.consoleClient;
    if (!client) {
      setError('Console client not configured');
      setPhase(null);
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
      setMessages,
      setPhase,
      setError,
    });

    return () => {
      abortController.abort();
    };
  }, [opts.enabled, opts.pipelineId, opts.serverless]);

  return { messages, phase, error };
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

  const refresh = useCallback(() => {
    history.refetch();
  }, [history.refetch]);

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
    refresh,
  };
}
