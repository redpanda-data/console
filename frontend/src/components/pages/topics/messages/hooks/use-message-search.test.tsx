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
import { Code, ConnectError, createClient, createRouterTransport } from '@connectrpc/connect';
import { createAsyncIterable } from '@connectrpc/connect/protocol';
import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import { act, cleanup, type RenderHookResult, renderHook, waitFor } from '@testing-library/react';
import { config } from 'config';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import {
  type ListMessagesRequest,
  type ListMessagesResponse,
  ListMessagesResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { toast } from 'sonner';
import { PartitionOffsetOrigin } from 'state/ui';

import { type MessageSearchParams, type MessageSearchResult, useMessageSearch } from './use-message-search';
import { messageKey } from '../utils/message-key';

const TOPIC = 'orders';
const BASE_PARAMS = {
  startOffset: -1,
  startTimestamp: -1,
  partitionId: -1,
  maxResults: 50,
  filterInterpreterCode: '',
} satisfies MessageSearchParams;
const LIVE_PARAMS = { ...BASE_PARAMS, startOffset: PartitionOffsetOrigin.End };
const originalClient = config.consoleClient;

type Stream = () => AsyncIterable<ListMessagesResponse>;
const replies: Stream[] = [];
const attempts: { request: ListMessagesRequest; timeoutMs: number | undefined; signal: AbortSignal }[] = [];
const openGates = new Set<() => void>();

beforeEach(() => {
  config.consoleClient = createClient(
    ConsoleService,
    createRouterTransport(({ service }) => {
      service(ConsoleService, {
        listMessages(request, context) {
          attempts.push({ request, timeoutMs: context.timeoutMs(), signal: context.signal });
          const reply = replies.shift();
          if (!reply) {
            throw new ConnectError('Unexpected message search request', Code.FailedPrecondition);
          }
          return reply();
        },
      });
    })
  );
});

afterEach(() => {
  try {
    cleanup();
    for (const release of openGates) {
      release();
    }
    toast.dismiss();
  } finally {
    replies.length = 0;
    attempts.length = 0;
    config.consoleClient = originalClient;
    rs.useRealTimers();
  }
});

function dataFrame(partitionId: number, offset: number, status = 'created') {
  const json = JSON.stringify({ status });
  return create(ListMessagesResponseSchema, {
    controlMessage: {
      case: 'data',
      value: {
        partitionId,
        offset: BigInt(offset),
        value: {
          encoding: PayloadEncoding.JSON,
          normalizedPayload: new TextEncoder().encode(json),
          payloadSize: json.length,
        },
      },
    },
  });
}

const doneFrame = (nextPageToken = '') =>
  create(ListMessagesResponseSchema, {
    controlMessage: {
      case: 'done',
      value: { bytesConsumed: 1024n, elapsedMs: 42n, nextPageToken, isCancelled: false },
    },
  });

const errorFrame = (message: string) =>
  create(ListMessagesResponseSchema, { controlMessage: { case: 'error', value: { message } } });

function replyWith(...frames: ListMessagesResponse[]) {
  replies.push(() => createAsyncIterable(frames));
}

function holdStream(beforePause: ListMessagesResponse[] = [], afterPause: ListMessagesResponse[] = []) {
  const gate = Promise.withResolvers<void>();
  const release = () => {
    openGates.delete(release);
    gate.resolve();
  };
  openGates.add(release);
  replies.push(async function* heldReply() {
    yield* beforePause;
    await gate.promise;
    yield* afterPause;
  });
  return release;
}

type SearchResult = RenderHookResult<MessageSearchResult, unknown>['result'];
const rowKeys = (result: SearchResult) => result.current.messages.map(messageKey);

async function startSearch() {
  const { result } = renderHook(() => useMessageSearch(TOPIC));
  await act(() => result.current.start(BASE_PARAMS));
  return result;
}

function startInBackground(result: SearchResult) {
  let started = Promise.resolve();
  act(() => {
    started = result.current.start(BASE_PARAMS);
  });
  return started;
}

async function finishStream(release: () => void, started: Promise<void>) {
  await act(async () => {
    release();
    await started;
  });
}

test('collects streamed rows and reports completion without flashing paged results', async () => {
  replyWith(
    create(ListMessagesResponseSchema, { controlMessage: { case: 'phase', value: { phase: 'Consuming messages' } } }),
    create(ListMessagesResponseSchema, {
      controlMessage: { case: 'progress', value: { bytesConsumed: 512n, messagesConsumed: 2n } },
    }),
    dataFrame(0, 1),
    dataFrame(0, 2),
    dataFrame(1, 7),
    doneFrame('token-1')
  );

  const result = await startSearch();

  expect(rowKeys(result)).toEqual(['0-1', '0-2', '1-7']);
  expect(result.current).toMatchObject({
    phase: 'done',
    bytesConsumed: 1024,
    elapsedMs: 42,
    nextPageToken: 'token-1',
    error: null,
  });
  expect(result.current.newKeys.size).toBe(0);
});

test('loads the next page with the backend token and appends its rows', async () => {
  replyWith(dataFrame(0, 1), doneFrame('page-2'));
  const result = await startSearch();
  expect(result.current.nextPageToken).toBe('page-2');

  replyWith(dataFrame(0, 2), doneFrame());
  await act(() => result.current.loadMore(25));

  expect(attempts).toHaveLength(2);
  expect(attempts[1]?.request).toMatchObject({ topic: TOPIC, pageToken: 'page-2', pageSize: 25 });
  expect(rowKeys(result)).toEqual(['0-1', '0-2']);
  expect(result.current.nextPageToken).toBeNull();
});

test('a superseded stream cannot overwrite the replacement search', async () => {
  const releaseOld = holdStream([dataFrame(0, 1)]);
  const { result } = renderHook(() => useMessageSearch(TOPIC));
  const startedOld = startInBackground(result);
  await waitFor(() => expect(rowKeys(result)).toEqual(['0-1']));

  const releaseNew = holdStream([], [dataFrame(2, 9), doneFrame()]);
  const startedNew = startInBackground(result);
  await finishStream(releaseOld, startedOld);
  expect(result.current).toMatchObject({ phase: 'connecting', messages: [] });

  await finishStream(releaseNew, startedNew);
  expect(rowKeys(result)).toEqual(['2-9']);
});

test('reloads a large message in place using a single raw, size-unlimited request', async () => {
  replyWith(dataFrame(0, 1), dataFrame(0, 2), doneFrame());
  const result = await startSearch();

  replyWith(dataFrame(0, 2, 'reloaded'));
  await act(() => result.current.loadLargeMessage(0, 2));

  expect(attempts.at(-1)?.request).toMatchObject({
    topic: TOPIC,
    partitionId: 0,
    startOffset: 2n,
    ignoreMaxSizeLimit: true,
    includeOriginalRawPayload: true,
    maxResults: 1,
  });
  expect(rowKeys(result)).toEqual(['0-1', '0-2']);
  expect(result.current.messages.map(({ valueJson }) => valueJson)).toEqual([
    '{"status":"created"}',
    '{"status":"reloaded"}',
  ]);
});

test('a transport failure rejects, keeps received rows, and exposes the error', async () => {
  replies.push(async function* interruptedReply() {
    for await (const frame of createAsyncIterable([dataFrame(0, 1)])) {
      yield frame;
    }
    throw new ConnectError('connection lost', Code.Unavailable);
  });
  const { result } = renderHook(() => useMessageSearch(TOPIC));

  await act(async () => {
    await expect(result.current.start(BASE_PARAMS)).rejects.toThrow('connection lost');
  });

  expect(rowKeys(result)).toEqual(['0-1']);
  expect(result.current.phase).toBe('done');
  expect(result.current.error?.message).toContain('connection lost');
});

test('a backend error followed by completion publishes a toast without failing the search', async () => {
  replyWith(errorFrame('N partitions offline'), doneFrame());

  const result = await startSearch();

  expect(result.current.error).toBeNull();
  expect(toast.getToasts()).toContainEqual(
    expect.objectContaining({ type: 'error', title: 'Backend error', description: 'N partitions offline' })
  );
});

test('a backend error without completion rejects the search', async () => {
  replyWith(errorFrame('permission denied'));
  const { result } = renderHook(() => useMessageSearch(TOPIC));

  await act(async () => {
    await expect(result.current.start(BASE_PARAMS)).rejects.toThrow('permission denied');
  });

  expect(result.current.error?.message).toBe('permission denied');
});

test('stopping an open search aborts the RPC without reporting a failure', async () => {
  const release = holdStream([dataFrame(0, 1)]);
  const { result } = renderHook(() => useMessageSearch(TOPIC));
  const started = startInBackground(result);
  await waitFor(() => expect(result.current.phase).toBe('streaming'));

  act(() => result.current.stop());
  expect(attempts[0]?.signal.aborted).toBe(true);
  await finishStream(release, started);

  expect(result.current.error).toBeNull();
});

test('live search marks arriving rows as new', async () => {
  replyWith(dataFrame(0, 5), dataFrame(0, 6), doneFrame());
  const { result } = renderHook(() => useMessageSearch(TOPIC));

  await act(() => result.current.start(LIVE_PARAMS, { live: true }));

  expect(result.current.newKeys).toEqual(new Set(['0-5', '0-6']));
});

test('normal searches use a short deadline and filtered and live searches use a longer one', async () => {
  rs.useFakeTimers();
  replyWith(doneFrame());
  const result = await startSearch();

  replyWith(doneFrame());
  await act(() => result.current.start({ ...BASE_PARAMS, filterInterpreterCode: 'cmV0dXJuIHRydWU=' }));
  replyWith(doneFrame());
  await act(() => result.current.start(LIVE_PARAMS, { live: true }));

  expect(attempts.map(({ timeoutMs }) => timeoutMs)).toEqual([30_000, 1_800_000, 1_800_000]);
});
