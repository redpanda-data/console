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

import { useEffect } from 'react';

const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30_000;

export const DEFAULT_LIVE_TAIL_MAX_RETRIES = 5;

/** Exponential backoff (capped) for the `failureCount`-th (1-indexed) consecutive failure. */
export function liveTailRetryDelayMs(failureCount: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** (failureCount - 1), MAX_RETRY_DELAY_MS);
}

export type LiveTailLoopOptions = {
  active: boolean;
  /** Starts (or restarts, appending) the tail. Must reject on a real failure — resolving for
   * both a clean completion and a hard failure is what causes an unbounded restart loop. */
  start: (append: boolean) => Promise<void>;
  stop: () => void;
  maxRetries?: number;
};

/**
 * Keeps a "live tail" stream running for as long as `active` is true. The backend bounds a
 * single consume to a page of results and then completes — it isn't an actually-endless stream —
 * so a *clean* completion restarts immediately (appending, so the table doesn't reset).
 *
 * A real failure must not restart immediately: hammering `start` at RTT speed hides the error
 * behind a fast reset loop and drives a request storm against the backend. Back off exponentially
 * instead, and give up after `maxRetries` consecutive failures (the failure itself stays visible
 * through whatever error state `start` already populates).
 */
export function useLiveTailLoop({
  active,
  start,
  stop,
  maxRetries = DEFAULT_LIVE_TAIL_MAX_RETRIES,
}: LiveTailLoopOptions) {
  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let failureCount = 0;

    const tick = (append: boolean) =>
      start(append)
        .then(() => {
          if (cancelled) {
            return;
          }
          failureCount = 0;
          tick(true);
        })
        .catch(() => {
          if (cancelled) {
            return;
          }
          failureCount += 1;
          if (failureCount > maxRetries) {
            return;
          }
          retryTimer = setTimeout(() => {
            if (!cancelled) {
              tick(true);
            }
          }, liveTailRetryDelayMs(failureCount));
        });

    tick(false);
    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      stop();
    };
  }, [active, start, stop, maxRetries]);
}
