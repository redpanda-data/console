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
import { Code, ConnectError, createClient, createRouterTransport, type HandlerContext } from '@connectrpc/connect';
import { createAsyncIterable } from '@connectrpc/connect/protocol';
import { afterEach, expect, test } from '@rstest/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { config } from 'config';
import { CompressionType, PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import {
  type ListMessagesRequest,
  type ListMessagesResponse,
  ListMessagesResponse_DataMessageSchema,
  ListMessagesResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import type { PropsWithChildren } from 'react';
import { toast } from 'sonner';

import { LIVE_INITIAL_STATE, liveReducer, MAX_LIVE_LOG_MESSAGES, useLogSearch } from './logs';
import { PartitionOffsetOrigin } from '../../state/ui';
import { convertListMessageData } from '../../utils/message-converters';

const PIPELINE = 'pipeline-1';
const LOGS_TOPIC = '__redpanda.connect.logs';
const LIVE_START = BigInt(PartitionOffsetOrigin.End);
const HISTORY_START = BigInt(PartitionOffsetOrigin.EndMinusResults);
const originalClient = config.consoleClient;
const clients = new Set<QueryClient>();
const DONE = create(ListMessagesResponseSchema, { controlMessage: { case: 'done', value: {} } });

afterEach(() => {
  try {
    cleanup();
    for (const client of clients) {
      client.clear();
    }
    toast.dismiss();
  } finally {
    clients.clear();
    config.consoleClient = originalClient;
  }
});

function logRecord(offset: number) {
  const message = JSON.stringify({ message: `msg-${offset}` });
  return create(ListMessagesResponse_DataMessageSchema, {
    partitionId: 0,
    offset: BigInt(offset),
    timestamp: BigInt(Date.UTC(2026, 0, 15) + offset),
    compression: CompressionType.UNCOMPRESSED,
    key: { normalizedPayload: new TextEncoder().encode(PIPELINE) },
    value: {
      encoding: PayloadEncoding.JSON,
      normalizedPayload: new TextEncoder().encode(message),
      payloadSize: message.length,
    },
  });
}

const dataFrame = (offset: number) =>
  create(ListMessagesResponseSchema, { controlMessage: { case: 'data', value: logRecord(offset) } });

const phaseFrame = (phase: string) =>
  create(ListMessagesResponseSchema, { controlMessage: { case: 'phase', value: { phase } } });

const progressFrame = (bytesConsumed: bigint, messagesConsumed: bigint) =>
  create(ListMessagesResponseSchema, {
    controlMessage: { case: 'progress', value: { bytesConsumed, messagesConsumed } },
  });

function untilAborted(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
    } else {
      signal.addEventListener('abort', () => resolve(), { once: true });
    }
  });
}

async function* holdStream({ signal }: HandlerContext, ...frames: ListMessagesResponse[]) {
  yield* frames;
  await untilAborted(signal);
}

type Reply = (context: HandlerContext) => AsyncIterable<ListMessagesResponse>;

function serveLogs({ history, live }: { history: Reply; live?: Reply }) {
  const attempts: { request: ListMessagesRequest; signal: AbortSignal }[] = [];
  config.consoleClient = createClient(
    ConsoleService,
    createRouterTransport(({ service }) => {
      service(ConsoleService, {
        listMessages(request, context) {
          attempts.push({ request, signal: context.signal });
          if (request.startOffset === HISTORY_START) {
            return history(context);
          }
          if (request.startOffset === LIVE_START && live) {
            return live(context);
          }
          throw new ConnectError('Unexpected log stream', Code.FailedPrecondition);
        },
      });
    })
  );
  return attempts;
}

function renderLogSearch({ live = false, retry = 0 } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry, retryDelay: 0 } },
  });
  clients.add(queryClient);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ live: enabledLive }) =>
      useLogSearch({ pipelineId: PIPELINE, live: enabledLive, enabled: true, serverless: false }),
    { wrapper, initialProps: { live } }
  );
  return { ...view, queryClient };
}

const logHistory = () => createAsyncIterable([dataFrame(1), dataFrame(2), DONE]);
const errorToasts = () => toast.getHistory().filter((entry) => 'type' in entry && entry.type === 'error').length;

const timeoutFailure = () => {
  throw new ConnectError('the operation timed out', Code.DeadlineExceeded);
};

test('merges history and the live stream in newest-first order without duplicates', async () => {
  const attempts = serveLogs({
    history: logHistory,
    live: (context) => holdStream(context, dataFrame(2), dataFrame(3)),
  });
  const { result } = renderLogSearch({ live: true });

  await waitFor(() => expect(result.current.messages.map(({ offset }) => offset)).toEqual([3, 2, 1]));
  expect(attempts.map(({ request }) => request.topic)).toEqual([LOGS_TOPIC, LOGS_TOPIC]);
});

test('clears the searching phase after history arrives while the tail remains open', async () => {
  const attempts = serveLogs({
    history: () => createAsyncIterable([dataFrame(1), DONE]),
    live: (context) => holdStream(context, phaseFrame('Consuming messages'), progressFrame(0n, 0n)),
  });
  const { result } = renderLogSearch({ live: true });

  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  expect(result.current.phase).toBeNull();
  expect(attempts.find(({ request }) => request.startOffset === LIVE_START)?.signal.aborted).toBe(false);
});

test('continues to display live logs after the history request times out', async () => {
  serveLogs({ history: timeoutFailure, live: (context) => holdStream(context, dataFrame(3)) });
  const { result, queryClient } = renderLogSearch({ live: true });

  await waitFor(() => expect(queryClient.getQueryState(['log-history', PIPELINE])?.status).toBe('error'));
  await waitFor(() => expect(result.current.messages.map(({ offset }) => offset)).toEqual([3]));
  expect(result.current.error).toBeNull();
});

test('refreshes history on both transitions into and out of live mode', async () => {
  const attempts = serveLogs({ history: logHistory, live: holdStream });
  const { rerender } = renderLogSearch();
  const historyReads = () => attempts.filter(({ request }) => request.startOffset === HISTORY_START);
  await waitFor(() => expect(historyReads()).toHaveLength(1));

  rerender({ live: true });
  await waitFor(() => expect(historyReads()).toHaveLength(2));

  rerender({ live: false });
  await waitFor(() => expect(historyReads()).toHaveLength(3));
});

test('publishes data and progress before a history stream completes', async () => {
  serveLogs({
    history: (context) =>
      holdStream(context, phaseFrame('Consuming messages'), progressFrame(10_000n, 99n), dataFrame(1)),
  });
  const { result } = renderLogSearch();

  await waitFor(() => expect(result.current.messages).toHaveLength(1));
  expect(result.current.phase).toBe('Consuming messages');
  expect(result.current.progress).toEqual({ bytesConsumed: 10_000, messagesConsumed: 99 });
  expect(result.current.messages[0]?.valueJson).toBe('{"message":"msg-1"}');
});

test('returns history alone in newest-first order', async () => {
  serveLogs({ history: () => createAsyncIterable([dataFrame(1), dataFrame(2), dataFrame(3), DONE]) });
  const { result } = renderLogSearch();

  await waitFor(() => expect(result.current.messages.map(({ offset }) => offset)).toEqual([3, 2, 1]));
});

test('treats a missing logs topic as a successful empty result without a toast', async () => {
  const before = errorToasts();
  serveLogs({
    history: () => {
      throw new ConnectError(
        'failed to get metadata for __redpanda.connect.logs: UNKNOWN_TOPIC_OR_PARTITION',
        Code.Unknown
      );
    },
  });
  const { result, queryClient } = renderLogSearch();

  await waitFor(() => expect(queryClient.getQueryState(['log-history', PIPELINE])?.status).toBe('success'));
  expect(result.current).toMatchObject({ phase: null, error: null, messages: [] });
  expect(errorToasts()).toBe(before);
});

test('reports a timed-out search without scheduling another request', async () => {
  const attempts = serveLogs({ history: timeoutFailure });
  const { result } = renderLogSearch({ retry: 1 });

  await waitFor(() => expect(result.current.error).toBe('The log search timed out. Refresh to try again.'));
  expect(attempts).toHaveLength(1);
});

test('the live buffer drops the oldest entries when it reaches capacity', () => {
  const batch = Array.from({ length: MAX_LIVE_LOG_MESSAGES + 10 }, (_, offset) =>
    convertListMessageData(logRecord(offset))
  );
  const next = liveReducer(LIVE_INITIAL_STATE, { type: 'flushMessages', msgs: batch });

  expect(next.messages).toHaveLength(MAX_LIVE_LOG_MESSAGES);
  expect(next.messages[0]?.offset).toBe(MAX_LIVE_LOG_MESSAGES + 9);
  expect(next.messages.at(-1)?.offset).toBe(10);
});
