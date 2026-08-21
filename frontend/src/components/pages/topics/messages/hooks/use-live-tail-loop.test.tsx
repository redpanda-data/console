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

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { liveTailRetryDelayMs, useLiveTailLoop } from './use-live-tail-loop';

describe('liveTailRetryDelayMs', () => {
  test('backs off exponentially, capped at 30s', () => {
    expect(liveTailRetryDelayMs(1)).toBe(1000);
    expect(liveTailRetryDelayMs(2)).toBe(2000);
    expect(liveTailRetryDelayMs(3)).toBe(4000);
    expect(liveTailRetryDelayMs(6)).toBe(30_000);
    expect(liveTailRetryDelayMs(10)).toBe(30_000);
  });
});

describe('useLiveTailLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('inactive: never starts', () => {
    const start = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useLiveTailLoop({ active: false, start, stop: vi.fn() }));
    expect(start).not.toHaveBeenCalled();
  });

  // Regression: the tail must keep tailing (restart transparently) for as long as it's
  // active, since the backend bounds a single consume to a page and then completes.
  test('restarts, appending, on every clean completion', async () => {
    // A real `start` always has async work in between (the network round-trip); with none here,
    // an uncapped success chain would recurse in a tight synchronous loop and never yield back to
    // the test — so it hangs after the 3rd call, which is enough to prove the restart happens.
    let calls = 0;
    const start = vi.fn().mockImplementation(() => {
      calls += 1;
      return calls >= 3 ? new Promise<void>(() => {}) : Promise.resolve();
    });
    renderHook(() => useLiveTailLoop({ active: true, start, stop: vi.fn() }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(start).toHaveBeenCalledTimes(3);
    expect(start.mock.calls[0][0]).toBe(false);
    expect(start.mock.calls[1][0]).toBe(true);
    expect(start.mock.calls[2][0]).toBe(true);
  });

  // Regression for the retry-storm bug: a rejecting `start` must not be retried
  // immediately — that hammered the backend at RTT speed while hiding the error
  // behind a fast reset loop. It must back off instead.
  test('a hard failure backs off instead of restarting immediately', async () => {
    const start = vi.fn().mockRejectedValue(new Error('boom'));
    renderHook(() => useLiveTailLoop({ active: true, start, stop: vi.fn() }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(start).toHaveBeenCalledTimes(1);

    // Still within the first backoff window (1000ms) — must not have retried yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(start).toHaveBeenCalledTimes(2);
  });

  test('gives up after maxRetries consecutive failures instead of retrying forever', async () => {
    const start = vi.fn().mockRejectedValue(new Error('boom'));
    renderHook(() => useLiveTailLoop({ active: true, start, stop: vi.fn(), maxRetries: 2 }));

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
    }
    // 1 initial attempt + 2 retries, then it must stop scheduling more.
    expect(start).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(start).toHaveBeenCalledTimes(3);
  });

  test('a clean completion after a failure resets the backoff (no cumulative penalty)', async () => {
    let calls = 0;
    const start = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error('boom'));
      }
      // Hang from the 2nd success onward so the immediate-restart chain has somewhere to stop.
      return calls >= 3 ? new Promise<void>(() => {}) : Promise.resolve();
    });
    renderHook(() => useLiveTailLoop({ active: true, start, stop: vi.fn() }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(start).toHaveBeenCalledTimes(1);

    // First backoff (1000ms) elapses; the retry (call 2) succeeds and immediately restarts
    // (call 3) with no further backoff — proving the failure count reset on success.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(start).toHaveBeenCalledTimes(3);
  });

  test('deactivating stops the stream and cancels any pending retry', async () => {
    const start = vi.fn().mockRejectedValue(new Error('boom'));
    const stop = vi.fn();
    const { unmount } = renderHook(() => useLiveTailLoop({ active: true, start, stop }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(start).toHaveBeenCalledTimes(1);

    unmount();
    expect(stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(start).toHaveBeenCalledTimes(1);
  });
});
