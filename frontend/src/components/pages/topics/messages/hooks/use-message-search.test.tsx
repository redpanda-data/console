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

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { type MessageSearchParams, useMessageSearch } from './use-message-search';
import { messageKey } from '../utils/message-key';

// The hook feeds raw data frames through convertListMessageData; identity-mock it so
// tests can use plain {partitionID, offset} stubs without building full proto payloads.
vi.mock('../../../../../utils/message-converters', () => ({
  convertListMessageData: (value: unknown) => value,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

type Frame =
  | { case: 'phase'; value: { phase: string } }
  | { case: 'progress'; value: { bytesConsumed: bigint; messagesConsumed: bigint } }
  | { case: 'done'; value: { bytesConsumed: bigint; elapsedMs: bigint; nextPageToken: string; isCancelled: boolean } }
  | { case: 'error'; value: { message: string } }
  | { case: 'data'; value: { partitionID: number; offset: number } };

const listMessagesMock = vi.fn();

vi.mock('../../../../../config', () => ({
  config: {
    get consoleClient() {
      return { listMessages: listMessagesMock };
    },
  },
}));

const dataFrame = (partitionID: number, offset: number): Frame => ({
  case: 'data',
  value: { partitionID, offset },
});

const doneFrame = (nextPageToken = ''): Frame => ({
  case: 'done',
  value: { bytesConsumed: 1024n, elapsedMs: 42n, nextPageToken, isCancelled: false },
});

/** Builds a listMessages implementation yielding the given frames, capturing call args. */
function scriptStream(...frames: Frame[]) {
  listMessagesMock.mockImplementation((_req: unknown, _opts: { signal?: AbortSignal; timeoutMs: number }) =>
    (async function* () {
      for (const frame of frames) {
        await Promise.resolve();
        yield { controlMessage: frame };
      }
    })()
  );
}

/**
 * One-shot listMessages implementation that yields the given frames, then hangs until the
 * returned `release` is called — lets a test hold a stream open mid-flight (so it's still
 * running, not yet at its `finally`) while a second, newer call supersedes it.
 */
function pausedStream(...framesBeforePause: Frame[]) {
  let release = () => {
    // replaced synchronously below
  };
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  listMessagesMock.mockImplementationOnce(() =>
    (async function* () {
      for (const frame of framesBeforePause) {
        await Promise.resolve();
        yield { controlMessage: frame };
      }
      await gate;
    })()
  );
  return () => release();
}

const baseParams: MessageSearchParams = {
  startOffset: -1,
  startTimestamp: -1,
  partitionId: -1,
  maxResults: 50,
  filterInterpreterCode: '',
};

describe('useMessageSearch', () => {
  beforeEach(() => {
    listMessagesMock.mockReset();
  });

  test('collects data frames and finishes with done stats', async () => {
    scriptStream(
      { case: 'phase', value: { phase: 'Consuming messages' } },
      { case: 'progress', value: { bytesConsumed: 512n, messagesConsumed: 2n } },
      dataFrame(0, 1),
      dataFrame(0, 2),
      dataFrame(1, 7),
      doneFrame('token-1')
    );

    const { result } = renderHook(() => useMessageSearch('test-topic'));
    await act(() => result.current.start(baseParams));

    expect(result.current.messages.map(messageKey)).toEqual(['0-1', '0-2', '1-7']);
    expect(result.current.phase).toBe('done');
    expect(result.current.bytesConsumed).toBe(1024);
    expect(result.current.elapsedMs).toBe(42);
    expect(result.current.nextPageToken).toBe('token-1');
    expect(result.current.error).toBeNull();
  });

  test('loadMore appends using the next page token', async () => {
    scriptStream(dataFrame(0, 1), doneFrame('page-2'));
    const { result } = renderHook(() => useMessageSearch('test-topic'));
    await act(() => result.current.start(baseParams));
    expect(result.current.nextPageToken).toBe('page-2');

    scriptStream(dataFrame(0, 2), doneFrame(''));
    await act(() => result.current.loadMore(25));

    expect(listMessagesMock).toHaveBeenCalledTimes(2);
    const secondReq = listMessagesMock.mock.calls[1][0];
    expect(secondReq.pageToken).toBe('page-2');
    expect(secondReq.pageSize).toBe(25);
    expect(result.current.messages.map(messageKey)).toEqual(['0-1', '0-2']);
    expect(result.current.nextPageToken).toBeNull();
  });

  test('a new start clears previous results', async () => {
    scriptStream(dataFrame(0, 1), doneFrame());
    const { result } = renderHook(() => useMessageSearch('test-topic'));
    await act(() => result.current.start(baseParams));
    expect(result.current.messages).toHaveLength(1);

    scriptStream(dataFrame(2, 9), doneFrame());
    await act(() => result.current.start(baseParams));
    expect(result.current.messages.map(messageKey)).toEqual(['2-9']);
  });

  test('start with append:true keeps previous results (live tail restarting after hitting maxResults)', async () => {
    scriptStream(dataFrame(0, 1), doneFrame());
    const { result } = renderHook(() => useMessageSearch('test-topic'));
    await act(() => result.current.start(baseParams, { live: true }));
    expect(result.current.messages).toHaveLength(1);

    scriptStream(dataFrame(0, 2), doneFrame());
    await act(() => result.current.start(baseParams, { live: true, append: true }));
    expect(result.current.messages.map(messageKey)).toEqual(['0-1', '0-2']);
  });

  test('a superseded run must not finalize state (phase/backendPhase/messages) after a newer run replaces it', async () => {
    const releaseA = pausedStream(dataFrame(0, 1));
    const { result } = renderHook(() => useMessageSearch('test-topic'));

    let startA: Promise<void> = Promise.resolve();
    act(() => {
      startA = result.current.start(baseParams);
    });
    await waitFor(() => expect(result.current.phase).toBe('streaming'));

    // B replaces A while A is still paused mid-stream (not yet at its `finally`).
    const releaseB = pausedStream();
    act(() => {
      result.current.start(baseParams);
    });
    expect(result.current.phase).toBe('connecting');

    // A's abort now resolves (on a later microtask, as it would for a real aborted fetch) —
    // its `finally` runs after B has already taken over.
    await act(async () => {
      releaseA();
      await startA;
    });

    // B's in-progress state must survive; A's stale completion must not have overwritten it.
    expect(result.current.phase).toBe('connecting');

    releaseB(); // let B settle so it doesn't dangle past the test
    await waitFor(() => expect(result.current.phase).toBe('done'));
  });

  test('stream failure surfaces as error state', async () => {
    listMessagesMock.mockImplementation(() =>
      (async function* () {
        await Promise.resolve();
        yield { controlMessage: dataFrame(0, 1) };
        throw new Error('connection lost');
      })()
    );

    const { result } = renderHook(() => useMessageSearch('test-topic'));
    await act(() => result.current.start(baseParams));

    await waitFor(() => expect(result.current.error?.message).toBe('connection lost'));
    // Data received before the failure is kept
    expect(result.current.messages).toHaveLength(1);
  });

  test('live mode marks arriving rows as new', async () => {
    scriptStream(dataFrame(0, 5), dataFrame(0, 6), doneFrame());
    const { result } = renderHook(() => useMessageSearch('test-topic'));
    await act(() => result.current.start({ ...baseParams, startOffset: -3 }, { live: true }));

    expect(result.current.newKeys.has('0-5')).toBe(true);
    expect(result.current.newKeys.has('0-6')).toBe(true);
  });

  test('non-live paged searches do not flash rows', async () => {
    scriptStream(dataFrame(0, 5), doneFrame());
    const { result } = renderHook(() => useMessageSearch('test-topic'));
    await act(() => result.current.start(baseParams));
    expect(result.current.newKeys.size).toBe(0);
  });

  test('uses the long timeout for live and filtered streams, short otherwise', async () => {
    const { result } = renderHook(() => useMessageSearch('test-topic'));

    scriptStream(doneFrame());
    await act(() => result.current.start(baseParams));
    expect(listMessagesMock.mock.calls[0][1].timeoutMs).toBe(30 * 1000);

    scriptStream(doneFrame());
    await act(() => result.current.start({ ...baseParams, filterInterpreterCode: 'cmV0dXJuIHRydWU=' }));
    expect(listMessagesMock.mock.calls[1][1].timeoutMs).toBe(30 * 60 * 1000);

    scriptStream(doneFrame());
    await act(() => result.current.start(baseParams, { live: true }));
    expect(listMessagesMock.mock.calls[2][1].timeoutMs).toBe(30 * 60 * 1000);
  });

  test('loadLargeMessage replaces the matching row in place', async () => {
    scriptStream(dataFrame(0, 1), dataFrame(0, 2), doneFrame());
    const { result } = renderHook(() => useMessageSearch('test-topic'));
    await act(() => result.current.start(baseParams));

    listMessagesMock.mockImplementation(() =>
      (async function* () {
        await Promise.resolve();
        yield { controlMessage: { case: 'data', value: { partitionID: 0, offset: 2, reloaded: true } } };
      })()
    );
    await act(() => result.current.loadLargeMessage(0, 2));

    const replaced = result.current.messages[1] as { reloaded?: boolean };
    expect(replaced.reloaded).toBe(true);
    // The one-off fetch must lift the size limit and request the raw payload
    const req = listMessagesMock.mock.calls.at(-1)?.[0];
    expect(req.ignoreMaxSizeLimit).toBe(true);
    expect(req.includeOriginalRawPayload).toBe(true);
    expect(req.maxResults).toBe(1);
  });
});
