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

import { Code, ConnectError } from '@connectrpc/connect';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { toast } from 'sonner';

import type { TopicMessage } from '../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../state/ui';

// Track messages returned by convertListMessageData
let convertCallIndex = 0;
const fakeMessages: TopicMessage[] = [];

rs.mock('../../utils/message-converters', () => ({
  // Tests that run two streams at once pass the message in the payload instead of relying on call order.
  convertListMessageData: (value: { message?: TopicMessage }) => {
    if (value?.message) {
      return value.message;
    }
    const msg = fakeMessages[convertCallIndex];
    convertCallIndex++;
    return msg;
  },
}));

rs.mock('sonner', () => ({
  toast: { error: rs.fn(), success: rs.fn() },
}));

// Mock config with a fake consoleClient
const mockListMessages = rs.fn();
rs.mock('../../config', () => ({
  config: {
    get consoleClient() {
      return { listMessages: mockListMessages };
    },
  },
}));

import { LIVE_INITIAL_STATE, liveReducer, MAX_LIVE_LOG_MESSAGES, useLogSearch } from './logs';

function makeMessage(id: number, keyJson = 'pipeline-1'): TopicMessage {
  return {
    partitionID: 0,
    offset: id,
    timestamp: Date.UTC(2026, 0, 15) + id,
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: { payload: keyJson, isPayloadNull: false, encoding: 'text', schemaId: 0, size: 0 },
    value: { payload: { message: `msg-${id}` }, isPayloadNull: false, encoding: 'json', schemaId: 0, size: 10 },
    valueJson: JSON.stringify({ message: `msg-${id}` }),
    valueBinHexPreview: '',
    keyJson,
    keyBinHexPreview: '',
  } as TopicMessage;
}

function createWrapper({ retry = false }: { retry?: boolean | number } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry, retryDelay: 0 } },
  });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const dataOf = (message: TopicMessage) => ({ controlMessage: { case: 'data' as const, value: { message } } });
const DONE = { controlMessage: { case: 'done' as const, value: {} } };
const LIVE_START_OFFSET = BigInt(PartitionOffsetOrigin.End);

type StreamRequest = { startOffset: bigint };
type StreamOptions = { signal: AbortSignal };

/** Live mode opens a history read and a tail side by side; this tells them apart. */
function mockStreams(streams: {
  history: (opts: StreamOptions) => Iterable<unknown> | AsyncIterable<unknown>;
  live: (opts: StreamOptions) => Iterable<unknown> | AsyncIterable<unknown>;
}) {
  mockListMessages.mockImplementation((req: StreamRequest, opts: StreamOptions) =>
    req.startOffset === LIVE_START_OFFSET ? streams.live(opts) : streams.history(opts)
  );
}

const untilAborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => resolve());
  });

describe('useLogSearch live mode', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    convertCallIndex = 0;
    fakeMessages.length = 0;
  });

  test('shows recent history, with new messages on top', async () => {
    mockStreams({
      *history() {
        yield dataOf(makeMessage(1));
        yield dataOf(makeMessage(2));
        yield DONE;
      },
      async *live({ signal }) {
        yield dataOf(makeMessage(3));
        await untilAborted(signal);
      },
    });

    const { result } = renderHook(
      () => useLogSearch({ pipelineId: 'pipeline-1', live: true, enabled: true, serverless: false }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.messages.map((m) => m.offset)).toEqual([3, 2, 1]));
  });

  test('keeps one copy of a message both the history and the tail returned', async () => {
    mockStreams({
      *history() {
        yield dataOf(makeMessage(1));
        yield dataOf(makeMessage(2));
        yield DONE;
      },
      async *live({ signal }) {
        yield dataOf(makeMessage(2));
        yield dataOf(makeMessage(3));
        await untilAborted(signal);
      },
    });

    const { result } = renderHook(
      () => useLogSearch({ pipelineId: 'pipeline-1', live: true, enabled: true, serverless: false }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.messages.map((m) => m.offset)).toEqual([3, 2, 1]));
  });

  // The tail heartbeats with empty progress while open, which isn't a search in progress.
  test('stops searching once history is read, while the tail stays open', async () => {
    mockStreams({
      *history() {
        yield dataOf(makeMessage(1));
        yield DONE;
      },
      async *live({ signal }) {
        yield { controlMessage: { case: 'phase' as const, value: { phase: 'Consuming messages' } } };
        yield { controlMessage: { case: 'progress' as const, value: { bytesConsumed: 0n, messagesConsumed: 0n } } };
        await untilAborted(signal);
      },
    });

    const { result } = renderHook(
      () => useLogSearch({ pipelineId: 'pipeline-1', live: true, enabled: true, serverless: false }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.phase).toBeNull();
  });

  // Refresh is off while live, so the error would offer a retry that can't be taken.
  test('keeps the tail showing when the history read fails', async () => {
    mockStreams({
      // biome-ignore lint/correctness/useYield: fails before the first message
      *history() {
        throw new ConnectError('the operation timed out', Code.DeadlineExceeded);
      },
      async *live({ signal }) {
        yield dataOf(makeMessage(3));
        await untilAborted(signal);
      },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      () => useLogSearch({ pipelineId: 'pipeline-1', live: true, enabled: true, serverless: false }),
      {
        wrapper: ({ children }: PropsWithChildren) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    await waitFor(() => expect(result.current.messages.map((m) => m.offset)).toEqual([3]));
    await waitFor(() =>
      expect(
        queryClient
          .getQueryCache()
          .getAll()
          .some((query) => query.state.status === 'error')
      ).toBe(true)
    );
    rerender();
    expect(result.current.error).toBeNull();
  });

  // Entering re-reads so logs written since the search aren't skipped; leaving re-reads because the
  // tail's messages go with it.
  test.each([
    ['entering', false],
    ['leaving', true],
  ])('reads history again on %s live mode', async (_case, startsLive) => {
    const history = rs.fn(function* streamMessages() {
      yield DONE;
    });
    mockStreams({
      history,
      async *live({ signal }) {
        await untilAborted(signal);
      },
    });

    const { result, rerender } = renderHook(
      ({ live }: { live: boolean }) =>
        useLogSearch({ pipelineId: 'pipeline-1', live, enabled: true, serverless: false }),
      { wrapper: createWrapper(), initialProps: { live: startsLive } }
    );
    await waitFor(() => expect(result.current.phase).toBeNull());
    const reads = history.mock.calls.length;

    rerender({ live: !startsLive });

    await waitFor(() => expect(history).toHaveBeenCalledTimes(reads + 1));
  });
});

describe('useLogSearch history mode', () => {
  beforeEach(() => {
    rs.useFakeTimers({ shouldAdvanceTime: true });
    rs.clearAllMocks();
    convertCallIndex = 0;
    fakeMessages.length = 0;
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  test('reports progress during history streaming', async () => {
    fakeMessages.push(makeMessage(1));

    mockListMessages.mockImplementation(async function* streamMessages() {
      yield {
        controlMessage: {
          case: 'progress' as const,
          value: { bytesConsumed: 10_000n, messagesConsumed: 99n },
        },
      };
      yield {
        controlMessage: { case: 'data' as const, value: {} },
      };
      // Pause before done so the 200ms flush interval fires while phase is active
      await rs.advanceTimersByTimeAsync(250);
      yield {
        controlMessage: { case: 'done' as const, value: {} },
      };
    });

    const { result } = renderHook(
      () =>
        useLogSearch({
          pipelineId: 'pipeline-1',
          live: false,
          enabled: true,
          serverless: false,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.progress.bytesConsumed).toBe(10_000);
      expect(result.current.progress.messagesConsumed).toBe(99);
    });
  });

  test('returns history messages newest-first (matches live ordering)', async () => {
    fakeMessages.push(makeMessage(1), makeMessage(2), makeMessage(3));

    mockListMessages.mockImplementation(function* streamMessages() {
      for (const _msg of fakeMessages) {
        yield { controlMessage: { case: 'data' as const, value: {} } };
      }
      yield { controlMessage: { case: 'done' as const, value: {} } };
    });

    const { result } = renderHook(
      () => useLogSearch({ pipelineId: 'pipeline-1', live: false, enabled: true, serverless: false }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(3);
    });

    expect(result.current.messages[0].offset).toBe(3);
    expect(result.current.messages[2].offset).toBe(1);
  });

  test('treats a missing logs topic as no logs, not an error', async () => {
    mockListMessages.mockImplementation(function* streamMessages() {
      yield { controlMessage: { case: 'phase' as const, value: { phase: 'Get Partitions' } } };
      throw new ConnectError(
        'failed to get metadata for topic __redpanda.connect.logs: UNKNOWN_TOPIC_OR_PARTITION: This server does not host this topic-partition.',
        Code.Unknown
      );
    });

    const { result } = renderHook(
      () => useLogSearch({ pipelineId: 'pipeline-1', live: false, enabled: true, serverless: false }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.phase).toBeNull());
    expect(result.current.error).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  // The embedded app's client retries once by default.
  test('does not retry a timed-out search, and says it timed out', async () => {
    mockListMessages.mockImplementation(function* streamMessages() {
      yield { controlMessage: { case: 'phase' as const, value: { phase: 'Consuming messages' } } };
      throw new ConnectError('the operation timed out', Code.DeadlineExceeded);
    });

    const { result } = renderHook(
      () => useLogSearch({ pipelineId: 'pipeline-1', live: false, enabled: true, serverless: false }),
      { wrapper: createWrapper({ retry: 1 }) }
    );

    await waitFor(() => expect(result.current.error).toBe('The log search timed out. Refresh to try again.'));
    expect(mockListMessages).toHaveBeenCalledTimes(1);
  });
});

describe('liveReducer flushMessages cap', () => {
  test('caps the live buffer to MAX_LIVE_LOG_MESSAGES, keeping the newest entries', () => {
    const batch = Array.from({ length: MAX_LIVE_LOG_MESSAGES + 10 }, (_, i) => makeMessage(i));

    const next = liveReducer(LIVE_INITIAL_STATE, { type: 'flushMessages', msgs: batch });

    expect(next.messages).toHaveLength(MAX_LIVE_LOG_MESSAGES);
    // Newest-first: msgs are reversed on flush, so the highest offset is at the front.
    expect(next.messages[0].offset).toBe(MAX_LIVE_LOG_MESSAGES + 9);
    // Oldest entries are dropped by the sliding window.
    expect(next.messages.some((m) => m.offset === 0)).toBe(false);
  });
});
