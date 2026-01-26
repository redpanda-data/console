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

import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { memo } from 'react';

import { LogLevelBadge } from './log-level-badge';
import type { ParsedLogEntry } from './types';

/**
 * Column widths for consistent layout between header and rows.
 * Uses CSS Grid template columns for precise alignment.
 */
export const LOG_GRID_COLUMNS = 'grid-cols-[130px_65px_120px_1fr]';

export type LogRowProps = {
  /** The log entry to display */
  log: ParsedLogEntry;
  /** Callback when the row is clicked */
  onClick?: () => void;
  /** Whether this row is selected */
  isSelected?: boolean;
  /** Class name for the row container */
  className?: string;
};

const formatTimestamp = (timestamp: bigint): string => {
  const date = new Date(Number(timestamp));
  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const ROOT_PATH_PREFIX = /^root\./;

const formatPath = (path: string | null): string => {
  if (!path) {
    return 'root';
  }
  // Remove 'root.' prefix for cleaner display
  return path.replace(ROOT_PATH_PREFIX, '').split('.').join(' > ');
};

/**
 * A fixed-height row component that displays a single parsed log entry.
 * Uses CSS Grid for consistent column alignment with the header.
 * Click to view full details in a sheet panel.
 */
export const LogRow = memo(({ log, onClick, isSelected = false, className }: LogRowProps) => {
  // Extract message from log content - handle various field names
  const rawMessage = log.content?.message ?? log.content?.msg;
  const stringifiedMessage = rawMessage ? JSON.stringify(rawMessage) : '';
  const message = typeof rawMessage === 'string' ? rawMessage : stringifiedMessage;

  return (
    <button
      className={cn(
        'grid w-full cursor-pointer items-center gap-3 border-border/50 border-b px-3 py-2 text-left transition-colors hover:bg-muted/50',
        LOG_GRID_COLUMNS,
        log.level === 'ERROR' && 'bg-red-50/30 dark:bg-red-950/10',
        log.level === 'WARN' && 'bg-yellow-50/30 dark:bg-yellow-950/10',
        isSelected && 'bg-muted',
        className
      )}
      onClick={onClick}
      type="button"
    >
      {/* Timestamp */}
      <Text className="text-muted-foreground" variant="small">
        {formatTimestamp(log.timestamp)}
      </Text>

      {/* Level */}
      <LogLevelBadge level={log.level} />

      {/* Path */}
      <Text className="truncate text-muted-foreground" variant="small">
        {formatPath(log.path)}
      </Text>

      {/* Message */}
      <Text className="truncate font-mono">{message || '[No message]'}</Text>
    </button>
  );
});

LogRow.displayName = 'LogRow';

/**
 * Header row for the log table.
 * Uses the same grid layout as LogRow for alignment.
 */
export const LogRowHeader = memo(({ className }: { className?: string }) => (
  <div
    className={cn(
      'sticky top-0 z-10 grid w-full items-center gap-3 border-border/50 border-b bg-muted/50 px-3 py-2 text-left',
      LOG_GRID_COLUMNS,
      className
    )}
  >
    <Text variant="label">Timestamp</Text>
    <Text variant="label">Level</Text>
    <Text variant="label">Path</Text>
    <Text variant="label">Message</Text>
  </div>
));

LogRowHeader.displayName = 'LogRowHeader';
