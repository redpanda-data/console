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
import { ChevronDown, ChevronRight } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

import { LogLevelBadge } from './log-level-badge';
import { LogPayload } from './log-payload';
import type { ParsedLogEntry } from './types';

type LogRowProps = {
  /** The log entry to display */
  log: ParsedLogEntry;
  /** Whether to show the ID column (e.g., for multi-source views) */
  showId?: boolean;
  /** Label for the ID field in expanded view */
  idLabel?: string;
  /** Class name for the row container */
  className?: string;
};

const formatTimestamp = (timestamp: bigint): string => {
  const date = new Date(Number(timestamp));
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
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
 * A row component that displays a single parsed log entry.
 * Works with any data conforming to ParsedLogEntry interface.
 */
export const LogRow = memo(({ log, showId = false, idLabel = 'ID', className }: LogRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Extract message from log content - handle various field names
  const rawMessage = log.content?.message ?? log.content?.msg;
  const message = typeof rawMessage === 'string' ? rawMessage : rawMessage ? JSON.stringify(rawMessage) : '';

  return (
    <div
      className={cn(
        'border-b border-border/50 transition-colors hover:bg-muted/30',
        log.level === 'ERROR' && 'bg-red-50/30 dark:bg-red-950/10',
        log.level === 'WARN' && 'bg-yellow-50/30 dark:bg-yellow-950/10',
        className
      )}
    >
      {/* Main row - always visible */}
      <button
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left"
        onClick={toggleExpanded}
        type="button"
      >
        <span className="flex-shrink-0 text-muted-foreground">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        <span className="w-[180px] flex-shrink-0 font-mono text-xs text-muted-foreground">
          {formatTimestamp(log.timestamp)}
        </span>

        <span className="w-[70px] flex-shrink-0">
          <LogLevelBadge level={log.level} />
        </span>

        {showId && (
          <span className="w-[140px] flex-shrink-0">
            <Badge className="max-w-full truncate" size="sm" variant="simple">
              {log.id || '-'}
            </Badge>
          </span>
        )}

        <span className="w-[100px] flex-shrink-0">
          <Badge size="sm" variant="neutral-outline">
            {formatPath(log.path)}
          </Badge>
        </span>

        <span className="min-w-0 flex-1 truncate font-mono text-sm">{message || '[No message]'}</span>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border/30 bg-muted/20 px-4 py-3">
          <div className="grid gap-4">
            {/* Metadata row */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <div>
                <span className="font-medium text-muted-foreground">Partition: </span>
                <span>{log.partitionId}</span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Offset: </span>
                <span>{log.offset.toString()}</span>
              </div>
              {log.id && (
                <div>
                  <span className="font-medium text-muted-foreground">{idLabel}: </span>
                  <span className="font-mono">{log.id}</span>
                </div>
              )}
              {log.path && (
                <div>
                  <span className="font-medium text-muted-foreground">Path: </span>
                  <span className="font-mono">{log.path}</span>
                </div>
              )}
            </div>

            {/* Value payload */}
            <LogPayload label="Value" maxLength={2000} payload={log.message.value} />
          </div>
        </div>
      )}
    </div>
  );
});

LogRow.displayName = 'LogRow';
