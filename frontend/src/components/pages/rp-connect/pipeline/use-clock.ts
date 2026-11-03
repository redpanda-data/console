/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { useSyncExternalStore } from 'react';

const CLOCK_TICK_MS = 30_000;

// One ticking clock shared by every time label on the page.
let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: number | undefined;

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
      for (const notify of clockListeners) {
        notify();
      }
    }, CLOCK_TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

// Nothing ticks the clock while no label is shown, so the first read after a while catches it up.
function clockSnapshot(): number {
  if (Math.abs(Date.now() - clockNow) >= CLOCK_TICK_MS) {
    clockNow = Date.now();
  }
  return clockNow;
}

/** The current time, refreshed often enough for an "in 5m" label. */
export function useClock(): number {
  return useSyncExternalStore(subscribeClock, clockSnapshot);
}
