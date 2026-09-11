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

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';

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
  // Hoisted: the hook re-renders on its own status updates now, so an inline rs.fn()
  // would be a new `stop` identity every render and re-trigger the effect in a loop.
  const noopStop = rs.fn();
  beforeEach(() => {
    rs.useFakeTimers();
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  test('inactive: never starts', () => {
    const start = rs.fn().mockResolvedValue(undefined);
    renderHook(() => useLiveTailLoop({ active: false, start, stop: noopStop }));
    expect(start).not.toHaveBeenCalled();
  });

  // Regression: the tail must keep tailing (restart transparently) for as long as it's
  // active, since the backend bounds a single consume to a page and then completes.
  test('restarts, appending, on every clean completion', async () => {
    // A real `start` always has async work in between (the network round-trip); with none here,
    // an uncapped success chain would recurse in a tight synchronous loop and never yield back to
    // the test — so it hangs after the 3rd call, which is enough to prove the restart happens.
    let calls = 0;
    const start = rs.fn().mockImplementation(() => {
      calls += 1;
      return calls >= 3 ? new Promise<void>(() => {}) : Promise.resolve();
    });
    renderHook(() => useLiveTailLoop({ active: true, start, stop: noopStop }));

    await act(async () => {
      await rs.advanceTimersByTimeAsync(0);
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
    const start = rs.fn().mockRejectedValue(new Error('boom'));
    renderHook(() => useLiveTailLoop({ active: true, start, stop: noopStop }));

    await act(async () => {
      await rs.advanceTimersByTimeAsync(0);
    });
    expect(start).toHaveBeenCalledTimes(1);

    // Still within the first backoff window (1000ms) — must not have retried yet.
    await act(async () => {
      await rs.advanceTimersByTimeAsync(500);
    });
    expect(start).toHaveBeenCalledTimes(1);

    await act(async () => {
      await rs.advanceTimersByTimeAsync(600);
    });
    expect(start).toHaveBeenCalledTimes(2);
  });

  test('gives up after maxRetries consecutive failures instead of retrying forever', async () => {
    const start = rs.fn().mockRejectedValue(new Error('boom'));
    renderHook(() => useLiveTailLoop({ active: true, start, stop: noopStop, maxRetries: 2 }));

    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        await rs.advanceTimersByTimeAsync(60_000);
      });
    }
    // 1 initial attempt + 2 retries, then it must stop scheduling more.
    expect(start).toHaveBeenCalledTimes(3);

    await act(async () => {
      await rs.advanceTimersByTimeAsync(60_000);
    });
    expect(start).toHaveBeenCalledTimes(3);
  });

  test('a clean completion after a failure resets the backoff (no cumulative penalty)', async () => {
    let calls = 0;
    const start = rs.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(new Error('boom'));
      }
      // Hang from the 2nd success onward so the immediate-restart chain has somewhere to stop.
      return calls >= 3 ? new Promise<void>(() => {}) : Promise.resolve();
    });
    renderHook(() => useLiveTailLoop({ active: true, start, stop: noopStop }));

    await act(async () => {
      await rs.advanceTimersByTimeAsync(0);
    });
    expect(start).toHaveBeenCalledTimes(1);

    // First backoff (1000ms) elapses; the retry (call 2) succeeds and immediately restarts
    // (call 3) with no further backoff — proving the failure count reset on success.
    await act(async () => {
      await rs.advanceTimersByTimeAsync(1000);
    });
    expect(start).toHaveBeenCalledTimes(3);
  });

  test('deactivating stops the stream and cancels any pending retry', async () => {
    const start = rs.fn().mockRejectedValue(new Error('boom'));
    const stop = rs.fn();
    const { unmount } = renderHook(() => useLiveTailLoop({ active: true, start, stop }));

    await act(async () => {
      await rs.advanceTimersByTimeAsync(0);
    });
    expect(start).toHaveBeenCalledTimes(1);

    unmount();
    expect(stop).toHaveBeenCalledTimes(1);

    await act(async () => {
      await rs.advanceTimersByTimeAsync(60_000);
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('status reports exhausted after the retry budget, not running', async () => {
    const start = rs.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useLiveTailLoop({ active: true, start, stop: noopStop, maxRetries: 1 }));

    await act(async () => {
      await rs.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('retrying');

    await act(async () => {
      await rs.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.status).toBe('exhausted');
  });

  // Regression: with retries exhausted, the page's Retry action was a no-op — nothing could
  // re-arm the loop while the live toggle stayed on. restart() must start over with a fresh
  // failure budget.
  test('restart() re-arms an exhausted loop with a fresh failure budget', async () => {
    const start = rs.fn().mockRejectedValue(new Error('boom'));
    const stop = rs.fn();
    const { result } = renderHook(() => useLiveTailLoop({ active: true, start, stop, maxRetries: 1 }));

    await act(async () => {
      await rs.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current.status).toBe('exhausted');
    expect(start).toHaveBeenCalledTimes(2); // 1 initial + 1 retry

    start.mockImplementation(() => new Promise<void>(() => {})); // recovers: stream stays open
    act(() => {
      result.current.restart();
    });
    await act(async () => {
      await rs.advanceTimersByTimeAsync(0);
    });

    expect(start).toHaveBeenCalledTimes(3);
    expect(start.mock.calls[2][0]).toBe(false); // fresh start, not an append
    expect(result.current.status).toBe('running');
  });

  test('inactive loop reports idle', () => {
    const { result } = renderHook(() => useLiveTailLoop({ active: false, start: rs.fn(), stop: noopStop }));
    expect(result.current.status).toBe('idle');
  });
});
