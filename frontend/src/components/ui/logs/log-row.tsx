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

import { Badge } from 'components/redpanda-ui/components/badge';
import { cn } from 'components/redpanda-ui/lib/utils';
import { memo } from 'react';

import { LogLevelBadge } from './log-level-badge';
import type { ParsedLogEntry } from './types';

type LogRowProps = {
  /** The log entry to display */
  log: ParsedLogEntry;
  /** Whether to show the ID column (e.g., for multi-source views) */
  showId?: boolean;
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

const formatPath = (path: string | null): string => {
  if (!path) {
    return 'root';
  }
  // Remove 'root.' prefix for cleaner display
  return path.replace(/^root\./, '');
};

/**
 * A fixed-height row component that displays a single parsed log entry.
 * Click to view full details in a sheet panel.
 */
export const LogRow = memo(({ log, showId = false, onClick, isSelected = false, className }: LogRowProps) => {
  // Extract message from log content - handle various field names
  const rawMessage = log.content?.message ?? log.content?.msg;
  const message = typeof rawMessage === 'string' ? rawMessage : rawMessage ? JSON.stringify(rawMessage) : '';

  return (
    <button
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 border-border/50 border-b px-3 py-2 text-left transition-colors hover:bg-muted/50',
        log.level === 'ERROR' && 'bg-red-50/30 dark:bg-red-950/10',
        log.level === 'WARN' && 'bg-yellow-50/30 dark:bg-yellow-950/10',
        isSelected && 'bg-muted',
        className
      )}
      onClick={onClick}
      type="button"
    >
      <span className="w-[130px] shrink-0 font-mono text-muted-foreground text-xs">
        {formatTimestamp(log.timestamp)}
      </span>

      <span className="w-[65px] shrink-0">
        <LogLevelBadge level={log.level} />
      </span>

      {showId && (
        <span className="w-[120px] shrink-0">
          <Badge className="max-w-full truncate" size="sm" variant="simple">
            {log.id || '-'}
          </Badge>
        </span>
      )}

      <span className="w-[80px] shrink-0">
        <Badge size="sm" variant="neutral-outline">
          {formatPath(log.path)}
        </Badge>
      </span>

      <span className="min-w-0 flex-1 truncate font-mono text-sm">{message || '[No message]'}</span>
    </button>
  );
});

LogRow.displayName = 'LogRow';
