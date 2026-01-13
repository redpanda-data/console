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
import { getTextPreview, truncateWithEllipsis } from 'utils/string';

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

/**
 * Truncates a trace ID to a maximum length with ellipsis.
 * Re-exported from shared utils for backward compatibility.
 * @see truncateWithEllipsis in utils/string.ts
 */
export const formatTraceId = truncateWithEllipsis;

/**
 * Formats a byte size to a human-readable string.
 * Examples: "512B", "1.5KB", "2.3MB"
 */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

/**
 * Formats a Date to a 24-hour time string (HH:MM:SS).
 * Used for trace timestamps in the UI.
 */
export const formatTime = (timestamp: Date): string =>
  timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/**
 * Gets a preview of content, limited to a specified number of lines.
 * Re-exported from shared utils for backward compatibility.
 * @see getTextPreview in utils/string.ts
 */
export const getPreview = getTextPreview;
