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
import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import { config } from 'config';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import {
  type ListMessagesRequest,
  ListMessagesResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { useCallback } from 'react';
import { PartitionOffsetOrigin } from 'state/ui';

import { liveTailRetryDelayMs, useLiveTailLoop } from './use-live-tail-loop';
import { type MessageSearchParams, useMessageSearch } from './use-message-search';

type TailPage = {
  outcome: 'complete' | 'fail' | 'open';
  offsets?: number[];
};

const TOPIC = 'orders';
const SEARCH = {
  startOffset: PartitionOffsetOrigin.End,
  startTimestamp: -1,
  partitionId: -1,
  maxResults: 10,
  filterInterpreterCode: '',
} satisfies MessageSearchParams;
const FAIL = { outcome: 'fail' } satisfies TailPage;
const OPEN: TailPage = { outcome: 'open' };
const originalClient = config.consoleClient;

function streamData(offset: number) {
  return create(ListMessagesResponseSchema, {
    controlMessage: { case: 'data', value: { partitionId: 0, offset: BigInt(offset) } },
  });
}

function waitForClientToClose(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

function serveTail(...pages: TailPage[]) {
  const attempts: { request: ListMessagesRequest; signal: AbortSignal }[] = [];
  const transport = createRouterTransport(({ service }) => {
    service(ConsoleService, {
      async *listMessages(request, context) {
        attempts.push({ request, signal: context.signal });
        const page = pages.shift() ?? OPEN;
        for (const offset of page.offsets ?? []) {
          yield streamData(offset);
        }
        if (page.outcome === 'fail') {
          throw new ConnectError('broker disconnected', Code.Unavailable);
        }
        if (page.outcome === 'complete') {
          yield create(ListMessagesResponseSchema, { controlMessage: { case: 'done', value: {} } });
          return;
        }
        await waitForClientToClose(context.signal);
      },
    });
  });
  config.consoleClient = createClient(ConsoleService, transport);
  return attempts;
}

function renderTail(maxRetries?: number) {
  return renderHook(
    ({ active }) => {
      const { start: startSearch, stop, messages } = useMessageSearch(TOPIC);
      const start = useCallback((append: boolean) => startSearch(SEARCH, { live: true, append }), [startSearch]);
      const loop = useLiveTailLoop({ active, start, stop, maxRetries });
      return { ...loop, messages };
    },
    { initialProps: { active: true } }
  );
}

const advance = (ms: number) => act(() => rs.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  rs.useFakeTimers();
});

afterEach(async () => {
  try {
    cleanup();
    await advance(0);
  } finally {
    rs.useRealTimers();
    config.consoleClient = originalClient;
  }
});

test('retry delay doubles up to a thirty second cap', () => {
  expect([1, 2, 3, 6, 10].map(liveTailRetryDelayMs)).toEqual([1000, 2000, 4000, 30_000, 30_000]);
});

test('completed pages restart immediately and keep the earlier rows', async () => {
  const attempts = serveTail({ outcome: 'complete', offsets: [1] }, { outcome: 'complete', offsets: [2] });
  const { result } = renderTail();

  await advance(0);

  expect(attempts.map(({ request }) => [request.topic, request.startOffset])).toEqual([
    [TOPIC, BigInt(PartitionOffsetOrigin.End)],
    [TOPIC, BigInt(PartitionOffsetOrigin.End)],
    [TOPIC, BigInt(PartitionOffsetOrigin.End)],
  ]);
  expect(result.current.messages.map(({ offset }) => offset)).toEqual([1, 2]);
  expect(result.current.status).toBe('running');
});

test('transport failures back off before retrying and exhaust the configured budget', async () => {
  const attempts = serveTail(FAIL, FAIL, FAIL);
  const { result } = renderTail(2);

  await advance(999);
  expect([attempts.length, result.current.status]).toEqual([1, 'retrying']);
  await advance(1);
  expect(attempts).toHaveLength(2);
  await advance(60_000);

  expect([attempts.length, result.current.status]).toEqual([3, 'exhausted']);
});

test('a completed page resets the consecutive failure budget', async () => {
  const attempts = serveTail(FAIL, { outcome: 'complete', offsets: [2] }, FAIL, { outcome: 'complete', offsets: [3] });
  const { result } = renderTail(1);

  await advance(1000);
  expect([attempts.length, result.current.status]).toEqual([3, 'retrying']);
  await advance(999);
  expect(attempts).toHaveLength(3);
  await advance(1);

  expect([attempts.length, result.current.status]).toEqual([5, 'running']);
});

test('retry after exhaustion starts fresh and can back off again', async () => {
  const attempts = serveTail({ outcome: 'fail', offsets: [1] }, FAIL, FAIL, { outcome: 'complete', offsets: [2] });
  const { result } = renderTail(1);

  await advance(60_000);
  expect([attempts.length, result.current.status]).toEqual([2, 'exhausted']);
  expect(result.current.messages.map(({ offset }) => offset)).toEqual([1]);
  act(() => result.current.restart());
  await advance(0);
  expect(result.current.messages).toHaveLength(0);
  await advance(1000);

  expect([attempts.length, result.current.status]).toEqual([5, 'running']);
});

test('manual restart cancels the retry and switching off aborts the new stream', async () => {
  const attempts = serveTail(FAIL);
  const { result, rerender } = renderTail();

  await advance(0);
  expect(result.current.status).toBe('retrying');
  act(() => result.current.restart());
  await advance(60_000);
  expect([attempts.length, result.current.status]).toEqual([2, 'running']);

  rerender({ active: false });

  expect(attempts.at(-1)?.signal.aborted).toBe(true);
});

test('switching off an active tail cancels retry and restart stays inert', async () => {
  const attempts = serveTail(FAIL);
  const { result, rerender } = renderTail();

  await advance(0);
  expect(result.current.status).toBe('retrying');
  rerender({ active: false });
  act(() => result.current.restart());
  await advance(60_000);

  expect([attempts.length, result.current.status]).toEqual([1, 'idle']);
});
