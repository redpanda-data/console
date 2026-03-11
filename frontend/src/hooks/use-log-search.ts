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
import { toast as sonnerToast } from 'sonner';

import { config as appConfig } from '../config';
import { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import { ListMessagesRequestSchema } from '../protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import type { TopicMessage } from '../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../state/ui';
import { convertListMessageData } from '../utils/message-converters';

const LOGS_TOPIC = '__redpanda.connect.logs';
const LIVE_MAX_RESULTS = 1000;
const HISTORY_MAX_RESULTS = 1000;
const HISTORY_HOURS = 5;

interface UseLogSearchOptions {
  pipelineId: string;
  live: boolean;
  enabled: boolean;
}

interface UseLogSearchReturn {
  messages: TopicMessage[];
  phase: string | null;
  error: string | null;
  refresh: () => void;
}

export function useLogSearch({ pipelineId, live, enabled }: UseLogSearchOptions): UseLogSearchReturn {
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

  const executeSearch = useCallback(() => {
    if (!enabled) return;

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

    const req = create(ListMessagesRequestSchema);
    req.topic = LOGS_TOPIC;
    req.partitionId = -1;
    req.filterInterpreterCode = '';
    req.includeOriginalRawPayload = false;
    req.keyDeserializer = PayloadEncoding.UNSPECIFIED;
    req.valueDeserializer = PayloadEncoding.UNSPECIFIED;

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

    // Timeout: 30min for live (startOffset=End), 30s otherwise
    const timeoutMs = live ? 30 * 60 * 1000 : 30 * 1000;

    (async () => {
      try {
        for await (const res of client.listMessages(req, {
          signal: abortController.signal,
          timeoutMs,
        })) {
          if (abortController.signal.aborted) break;

          switch (res.controlMessage.case) {
            case 'phase':
              if (isMountedRef.current) setPhase(res.controlMessage.value.phase);
              break;
            case 'data': {
              const msg = convertListMessageData(res.controlMessage.value);
              if (msg.keyJson === pipelineId && isMountedRef.current) {
                setMessages((prev) => [...prev, msg]);
              }
              break;
            }
            case 'done':
              if (isMountedRef.current) setPhase(null);
              break;
            case 'error':
              if (isMountedRef.current) {
                const errMsg = res.controlMessage.value.message;
                sonnerToast.error('Failed to search pipeline logs', { description: errMsg });
                setError(errMsg);
              }
              break;
          }
        }
      } catch (e) {
        if (abortController.signal.aborted) return;
        if (isMountedRef.current) {
          const errMsg = e instanceof Error ? e.message : 'Unknown error';
          sonnerToast.error('Failed to search pipeline logs', { description: errMsg });
          setError(errMsg);
          setPhase(null);
        }
      } finally {
        if (isMountedRef.current && !abortController.signal.aborted) {
          setPhase(null);
        }
      }
    })();
  }, [enabled, live, pipelineId]);

  // Run search on mount and when params change
  useEffect(() => {
    executeSearch();
  }, [executeSearch]);

  return { messages, phase, error, refresh: executeSearch };
}
