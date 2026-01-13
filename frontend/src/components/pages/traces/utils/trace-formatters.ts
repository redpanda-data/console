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

/**
 * Maximum payload size before truncation (20KB).
 * Used to prevent UI performance issues with very large payloads.
 */
export const MAX_PAYLOAD_SIZE = 20 * 1024;

/**
 * Truncates content to a maximum size, appending a truncation message if needed.
 * @param content - The content to truncate
 * @param maxSize - Maximum size in characters (defaults to MAX_PAYLOAD_SIZE)
 */
export const truncateContent = (content: string, maxSize = MAX_PAYLOAD_SIZE): string => {
  if (content.length <= maxSize) {
    return content;
  }
  return `${content.slice(0, maxSize)}\n\n[... truncated ${content.length - maxSize} characters]`;
};

/**
 * Formats a JSON string with indentation for display.
 * Parses first, then optionally truncates the formatted output.
 * If parsing fails, returns the (optionally truncated) original content.
 * @param content - The JSON content to format
 * @param truncate - Whether to truncate the output (default: false)
 */
export const formatJsonContent = (content: string, truncate = false): string => {
  try {
    const parsed = JSON.parse(content);
    const formatted = JSON.stringify(parsed, null, 2);
    return truncate ? truncateContent(formatted) : formatted;
  } catch {
    return truncate ? truncateContent(content) : content;
  }
};
