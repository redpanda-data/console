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

import { useEffect, useRef, useState } from 'react';

import type { ParsedLogEntry } from './types';

const DEFAULT_BUFFER_INTERVAL = 1000; // 1 second
const STALE_THRESHOLD_MULTIPLIER = 2;

/**
 * Custom hook for batching log updates to prevent render storms during rapid streaming.
 * Maintains a buffer of new logs and clears it when streaming goes stale.
 *
 * @param newLogs - Array of newly received logs
 * @param interval - How often to consider logs "new" (in ms)
 * @returns Buffered array of new logs for highlight animation
 *
 * @example
 * ```tsx
 * const newLogsBuffer = useNewLogsBuffer(recentLogs, 1000);
 * const highlightKeys = useHighlightNewLogs(newLogsBuffer);
 * ```
 */
export function useNewLogsBuffer(newLogs: ParsedLogEntry[], interval = DEFAULT_BUFFER_INTERVAL): ParsedLogEntry[] {
  const [buffer, setBuffer] = useState<ParsedLogEntry[]>([]);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    if (newLogs.length === 0) {
      return;
    }

    lastUpdateRef.current = Date.now();
    setBuffer(newLogs);

    // Clear buffer if stream goes stale (no updates for 2x interval)
    const staleThreshold = interval * STALE_THRESHOLD_MULTIPLIER;
    const timer = setTimeout(() => {
      if (Date.now() - lastUpdateRef.current > staleThreshold) {
        setBuffer([]);
      }
    }, staleThreshold);

    return () => clearTimeout(timer);
  }, [newLogs, interval]);

  return buffer;
}
