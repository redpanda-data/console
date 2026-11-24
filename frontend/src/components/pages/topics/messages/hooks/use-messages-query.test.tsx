import { create } from '@bufbuild/protobuf';
import { createClient, createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import { config } from 'config';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { ConsoleService } from 'protogen/redpanda/api/console/v1alpha1/console_service_pb';
import {
  type ListMessagesRequest,
  ListMessagesResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { appGlobal } from 'state/app-global';
import { PartitionOffsetOrigin } from 'state/ui';

import { type MessageSearchParams, useMessageSearch } from './use-message-search';
import { isContinuousPagingActive, useAutoSearch, useSearchRunner } from './use-messages-query';

const TOPIC = 'orders';
const BASE_PARAMS = {
  startOffset: PartitionOffsetOrigin.EndMinusResults,
  startTimestamp: -1,
  partitionId: -1,
  maxResults: 50,
  pageSize: 25,
  filterInterpreterCode: '',
} satisfies MessageSearchParams;

const advance = (ms: number) =>
  act(async () => {
    await rs.advanceTimersByTimeAsync(ms);
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

function openStreams(attempts: { request: ListMessagesRequest; signal: AbortSignal }[]) {
  const transport = createRouterTransport(({ service }) => {
    service(ConsoleService, {
      async *listMessages(request, { signal }) {
        attempts.push({ request, signal });
        yield create(ListMessagesResponseSchema, {
          controlMessage: { case: 'phase', value: { phase: 'Consuming messages' } },
        });
        await untilAborted(signal);
      },
    });
  });
  return createClient(ConsoleService, transport);
}

const renderAutoSearch = (searchParams: MessageSearchParams) =>
  renderHook(
    (params: MessageSearchParams) => {
      const search = useMessageSearch(TOPIC);
      useAutoSearch({ search, searchParams: params, refreshCounter: 0, liveTail: false });
    },
    { initialProps: searchParams }
  );

type RunnerProps = { searchParams: MessageSearchParams; liveTail: boolean };

const renderRunner = (liveTail = false) =>
  renderHook<ReturnType<typeof useSearchRunner>, RunnerProps>(
    ({ searchParams, liveTail: active }) => {
      const search = useMessageSearch(TOPIC);
      return useSearchRunner({
        search,
        searchParams,
        filterInterpreterCode: searchParams.filterInterpreterCode,
        liveTail: active,
        partitionId: searchParams.partitionId,
      });
    },
    { initialProps: { searchParams: BASE_PARAMS, liveTail } }
  );

describe('isContinuousPagingActive', () => {
  test.each([
    ['newest', false, true],
    ['oldest', false, true],
    ['offset', false, false],
    ['timestamp', false, false],
    ['newest', true, false],
  ] as const)('%s scope with live tail %s → %s', (readScopeMode, liveTail, expected) => {
    expect(isContinuousPagingActive({ continuousMode: true, readScopeMode, liveTail })).toBe(expected);
  });

  test('is off whenever the toggle is off', () => {
    expect(isContinuousPagingActive({ continuousMode: false, readScopeMode: 'newest', liveTail: false })).toBe(false);
  });
});

describe('search runner hooks', () => {
  const originalClient = config.consoleClient;
  const attempts: { request: ListMessagesRequest; signal: AbortSignal }[] = [];

  beforeEach(() => {
    rs.useFakeTimers();
    config.consoleClient = openStreams(attempts);
  });

  afterEach(async () => {
    try {
      cleanup();
      await advance(0);
    } finally {
      config.consoleClient = originalClient;
      attempts.length = 0;
      rs.useRealTimers();
    }
  });

  test('debounces the first request and does not repeat it for equal params', async () => {
    const { rerender } = renderAutoSearch(BASE_PARAMS);
    await advance(99);
    expect(attempts).toHaveLength(0);

    await advance(1);
    expect(attempts[0]?.request).toMatchObject({ topic: TOPIC, maxResults: 50, pageSize: 25, partitionId: -1 });

    rerender({ ...BASE_PARAMS });
    await advance(100);
    expect(attempts).toHaveLength(1);
  });

  test('a partition change cancels the first stream and requests the new partition', async () => {
    const { rerender } = renderAutoSearch(BASE_PARAMS);
    await advance(100);

    rerender({ ...BASE_PARAMS, partitionId: 2 });
    expect(attempts[0]?.signal.aborted).toBe(true);
    await advance(100);

    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.request).toMatchObject({ topic: TOPIC, partitionId: 2 });
  });

  test('waits for a timestamp before starting a timestamp search', async () => {
    const unset = { ...BASE_PARAMS, startOffset: PartitionOffsetOrigin.Timestamp };
    const { rerender } = renderAutoSearch(unset);
    await advance(100);
    expect(attempts).toHaveLength(0);

    rerender({ ...unset, startTimestamp: 1234 });
    await advance(100);

    expect(attempts[0]?.request).toMatchObject({
      startOffset: BigInt(PartitionOffsetOrigin.Timestamp),
      startTimestamp: 1234n,
    });
  });

  test('both refresh entry points repeat the paged search and unmount clears the global trigger', async () => {
    const { result, unmount } = renderRunner();
    await advance(100);

    act(() => result.current.handleRefresh());
    await advance(100);
    expect(attempts).toHaveLength(2);

    act(() => appGlobal.searchMessagesFunc?.('manual'));
    await advance(100);
    expect(attempts.map(({ request }) => request.startOffset)).toEqual([
      BigInt(PartitionOffsetOrigin.EndMinusResults),
      BigInt(PartitionOffsetOrigin.EndMinusResults),
      BigInt(PartitionOffsetOrigin.EndMinusResults),
    ]);

    unmount();
    expect(appGlobal.searchMessagesFunc).toBeUndefined();
  });

  test('live tail owns the stream and restarts from the end when a filter is committed', async () => {
    const { rerender } = renderRunner(true);
    await advance(100);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.request).toMatchObject({ startOffset: BigInt(PartitionOffsetOrigin.End), pageSize: 0 });

    const filterInterpreterCode = 'cmV0dXJuIHRydWU7';
    rerender({ searchParams: { ...BASE_PARAMS, filterInterpreterCode }, liveTail: true });
    await advance(100);

    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.signal.aborted).toBe(true);
    expect(attempts[1]?.request).toMatchObject({
      filterInterpreterCode,
      startOffset: BigInt(PartitionOffsetOrigin.End),
    });
  });

  test('a deserializer change waits for a manual restart of the live stream', async () => {
    const { result, rerender } = renderRunner(true);
    await advance(0);
    rerender({ searchParams: { ...BASE_PARAMS, keyDeserializer: PayloadEncoding.JSON }, liveTail: true });
    await advance(0);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.signal.aborted).toBe(false);

    act(() => result.current.handleRefresh());
    await advance(0);

    expect(attempts[0]?.signal.aborted).toBe(true);
    expect(attempts[1]?.request).toMatchObject({ keyDeserializer: PayloadEncoding.JSON });
  });
});
