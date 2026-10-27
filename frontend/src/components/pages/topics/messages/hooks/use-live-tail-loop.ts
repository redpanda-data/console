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

import { useCallback, useEffect, useRef, useState } from 'react';

const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30_000;

export const DEFAULT_LIVE_TAIL_MAX_RETRIES = 5;

/** Exponential backoff (capped) for the `failureCount`-th (1-indexed) consecutive failure. */
export function liveTailRetryDelayMs(failureCount: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** (failureCount - 1), MAX_RETRY_DELAY_MS);
}

export type LiveTailStatus = 'idle' | 'running' | 'retrying' | 'exhausted';

export type LiveTailLoopOptions = {
  active: boolean;
  /** Starts (or restarts, appending) the tail. Must reject on a real failure — resolving for
   * both a clean completion and a hard failure is what causes an unbounded restart loop. */
  start: (append: boolean) => Promise<void>;
  stop: () => void;
  maxRetries?: number;
};

export type LiveTailLoop = {
  /** What the loop is actually doing — drive "streaming" UI off this, not off the toggle:
   * an exhausted loop with the toggle still on is NOT live. */
  status: LiveTailStatus;
  /** Tear the loop down and start it fresh (resets the failure budget). The recovery
   * path for an exhausted loop — and a manual "reconnect now" while it's backing off. */
  restart: () => void;
};

type LiveTailSession = Pick<LiveTailLoopOptions, 'start'> & {
  maxRetries: number;
  setStatus: (status: LiveTailStatus) => void;
};

/**
 * Runs one tail session until the returned cancel is called: a clean completion restarts at once
 * (appending), a failure backs off, and `maxRetries` consecutive failures end the session.
 */
function runLiveTailSession({ start, maxRetries, setStatus }: LiveTailSession): () => void {
  let cancelled = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failureCount = 0;

  const tick = (append: boolean) => {
    start(append)
      .then(() => {
        if (cancelled) {
          return;
        }
        failureCount = 0;
        setStatus('running');
        tick(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        failureCount += 1;
        if (failureCount > maxRetries) {
          setStatus('exhausted');
          return;
        }
        setStatus('retrying');
        retryTimer = setTimeout(() => {
          if (!cancelled) {
            tick(true);
          }
        }, liveTailRetryDelayMs(failureCount));
      });
  };

  setStatus('running');
  tick(false);
  return () => {
    cancelled = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
    }
  };
}

/**
 * Keeps a "live tail" stream running for as long as `active` is true. The backend bounds a
 * single consume to a page of results and then completes — it isn't an actually-endless stream —
 * so a *clean* completion restarts immediately (appending, so the table doesn't reset).
 *
 * A real failure must not restart immediately: hammering `start` at RTT speed hides the error
 * behind a fast reset loop and drives a request storm against the backend. Back off exponentially
 * instead, and give up after `maxRetries` consecutive failures (the failure itself stays visible
 * through whatever error state `start` already populates). After giving up, `status` reports
 * `'exhausted'` and only `restart()` re-arms the loop.
 */
export function useLiveTailLoop({
  active,
  start,
  stop,
  maxRetries = DEFAULT_LIVE_TAIL_MAX_RETRIES,
}: LiveTailLoopOptions): LiveTailLoop {
  const [status, setStatus] = useState<LiveTailStatus>('idle');
  // Cancels the running session; null while the loop is inactive.
  const cancelSessionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) {
      setStatus('idle');
      return;
    }
    cancelSessionRef.current = runLiveTailSession({ start, maxRetries, setStatus });
    return () => {
      // `restart` may have replaced the session this run began, so cancel whichever is current.
      cancelSessionRef.current?.();
      cancelSessionRef.current = null;
      stop();
    };
  }, [active, start, stop, maxRetries]);

  // Tears the running session down and starts over in its place, with a fresh failure budget.
  const restart = useCallback(() => {
    if (!cancelSessionRef.current) {
      return; // inactive: nothing to restart
    }
    cancelSessionRef.current();
    stop();
    cancelSessionRef.current = runLiveTailSession({ start, maxRetries, setStatus });
  }, [start, stop, maxRetries]);

  return { status, restart };
}
