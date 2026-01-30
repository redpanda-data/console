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

import { useEffect, useState } from 'react';

import type { ParsedLogEntry } from './types';

/**
 * Get unique key for a log entry (partition-offset).
 */
const getLogKey = (log: ParsedLogEntry): string => `${log.partitionId}-${log.offset.toString()}`;

/**
 * Converts buffered logs to a Set for O(1) lookup during render.
 * Used to highlight newly received logs with animation.
 *
 * @param newLogs - Array of new logs to highlight
 * @returns Set of log keys (partition-offset) for O(1) lookup
 *
 * @example
 * ```tsx
 * const highlightKeys = useHighlightNewLogs(newLogsBuffer);
 * const isNew = highlightKeys.has(`${log.partitionId}-${log.offset}`);
 * ```
 */
export function useHighlightNewLogs(newLogs: ParsedLogEntry[]): Set<string> {
  const [highlightKeys, setHighlightKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (newLogs.length === 0) {
      setHighlightKeys(new Set());
      return;
    }
    setHighlightKeys(new Set(newLogs.map(getLogKey)));
  }, [newLogs]);

  return highlightKeys;
}
