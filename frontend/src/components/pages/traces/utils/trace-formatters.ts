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

import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Uses concise format suitable for tracing UIs (e.g., "1.5h", "250ms", "10μs")
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}μs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  if (ms < 3_600_000) {
    return `${(ms / 60_000).toFixed(1)}m`;
  }
  return `${(ms / 3_600_000).toFixed(1)}h`;
};

/**
 * Formats a timestamp as a relative time string using date-fns.
 * Examples: "about 5 minutes ago", "2 hours ago", "3 days ago"
 */
export const formatTimestamp = (ms: number): string => formatDistanceToNow(new Date(ms), { addSuffix: true });

export const formatTraceId = (id: string, maxLength = 12): string => {
  if (id.length <= maxLength) {
    return id;
  }
  return `${id.slice(0, maxLength)}...`;
};
