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
/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: necessary complexity */

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { FacetedFilter } from 'components/redpanda-ui/components/faceted-filter';
import { Input } from 'components/redpanda-ui/components/input';
import {
  ListView,
  ListViewEnd,
  ListViewGroup,
  ListViewIntermediary,
  ListViewStart,
} from 'components/redpanda-ui/components/list-view';
import { ScrollArea } from 'components/redpanda-ui/components/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from 'components/redpanda-ui/components/sheet';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { Loader2, RefreshCw, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_SCOPE_OPTIONS } from './constants';
import { LogRowsSkeleton } from './log-explorer-skeleton';
import { LogLevelBadge } from './log-level-badge';
import { LogPayload } from './log-payload';
import { DEFAULT_LEVEL_OPTIONS, type LogLevel, type ParsedLogEntry, type ScopeOption } from './types';

/** Duration in ms for the "new row" highlight animation */
const NEW_ROW_HIGHLIGHT_DURATION = 3000;

type LogExplorerProps<T extends ParsedLogEntry = ParsedLogEntry> = {
  /** Parsed log entries to display */
  logs: T[];
  /** Whether the logs are currently loading/streaming */
  isLoading?: boolean;
  /** Error message if loading failed */
  error?: string | null;
  /** Callback to refresh/restart the log stream */
  onRefresh?: () => void;
  /** Label for the ID field */
  idLabel?: string;
  /** Maximum height of the log list (CSS value) */
  maxHeight?: string;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Class name for the container */
  className?: string;
  /** Custom scope options for filtering. Pass empty array to hide scope filter. */
  scopeOptions?: ScopeOption[];
  /** Custom search filter function. If not provided, searches in message content and id. */
  searchFilter?: (log: T, query: string) => boolean;
};

/**
 * Create a unique key for a log entry
 */
const getLogKey = (log: ParsedLogEntry): string => `${log.partitionId}-${log.offset.toString()}`;

/**
 * A reusable log explorer component with virtualization, filtering, and search.
 * Uses TanStack Virtual to only render visible rows for optimal performance.
 * Click a row to view full details in a side sheet.
 */
export const LogExplorer = memo(function LogExplorerComponent<T extends ParsedLogEntry>({
  logs,
  isLoading = false,
  error = null,
  onRefresh,
  idLabel = 'ID',
  maxHeight = '600px',
  emptyMessage = 'No logs found',
  className,
  scopeOptions = DEFAULT_SCOPE_OPTIONS as unknown as ScopeOption[],
  searchFilter,
}: LogExplorerProps<T>) {
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

  // Selected log for the detail sheet
  const [selectedLog, setSelectedLog] = useState<T | null>(null);

  // Track known log keys to identify new logs
  const knownLogsRef = useRef<Set<string>>(new Set());
  const [newLogKeys, setNewLogKeys] = useState<Set<string>>(new Set());

  // Default search filter
  const defaultSearchFilter = useCallback((log: T, query: string) => {
    const lowerQuery = query.toLowerCase();
    const message = log.content?.message ?? log.content?.msg ?? '';
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    return (
      messageStr.toLowerCase().includes(lowerQuery) ||
      log.id.toLowerCase().includes(lowerQuery) ||
      (log.path?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }, []);

  // Filter logs based on current filters
  const filteredLogs = useMemo(() => {
    let result = logs;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.trim();
      const filterFn = searchFilter ?? defaultSearchFilter;
      result = result.filter((log) => filterFn(log, query));
    }

    // Filter by level
    if (selectedLevels.length > 0) {
      result = result.filter((log) => log.level && selectedLevels.includes(log.level));
    }

    // Filter by scope
    if (selectedScopes.length > 0) {
      result = result.filter((log) => selectedScopes.includes(log.scope));
    }

    return result;
  }, [logs, searchQuery, selectedLevels, selectedScopes, searchFilter, defaultSearchFilter]);

  // Track new logs and manage highlight animation
  useEffect(() => {
    const currentKeys = new Set(logs.map(getLogKey));
    const newKeys = new Set<string>();

    // Find keys that weren't in knownLogsRef
    for (const key of currentKeys) {
      if (!knownLogsRef.current.has(key)) {
        newKeys.add(key);
      }
    }

    // If we have new logs, update state and schedule removal
    if (newKeys.size > 0) {
      setNewLogKeys((prev) => {
        const updated = new Set(prev);
        for (const key of newKeys) {
          updated.add(key);
        }
        return updated;
      });

      // Remove highlight after duration
      const timer = setTimeout(() => {
        setNewLogKeys((prev) => {
          const updated = new Set(prev);
          for (const key of newKeys) {
            updated.delete(key);
          }
          return updated;
        });
      }, NEW_ROW_HIGHLIGHT_DURATION);

      // Update known logs
      knownLogsRef.current = currentKeys;

      return () => clearTimeout(timer);
    }

    // Update known logs even if no new keys
    knownLogsRef.current = currentKeys;
  }, [logs]);


  // Toggle a level filter
  const toggleLevel = useCallback((level: LogLevel) => {
    setSelectedLevels((prev) => (prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]));
  }, []);

  // Toggle a scope filter
  const toggleScope = useCallback((scope: string) => {
    setSelectedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedLevels([]);
    setSelectedScopes([]);
  }, []);

  const hasFilters = searchQuery.trim() || selectedLevels.length > 0 || selectedScopes.length > 0;

  // Format path as tree structure
  const formatPath = useCallback((path: string | null): string => {
    if (!path) return 'root';
    // Remove 'root.' prefix and convert to tree format
    const cleanPath = path.replace(/^root\./, '');
    return cleanPath.split('.').join(' › ');
  }, []);

  // Format timestamp for display
  const formatTimestampShort = useCallback((timestamp: bigint): string => {
    const date = new Date(Number(timestamp));
    return date.toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <Input
          aria-label="Search logs"
          className="h-8 w-[200px]"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search logs..."
          value={searchQuery}
        />

        {/* Level filter */}
        <FacetedFilter
          onToggle={toggleLevel as (value: string) => void}
          options={DEFAULT_LEVEL_OPTIONS}
          selectedValues={selectedLevels}
          title="Level"
        />

        {/* Scope filter - only show if scopeOptions has items */}
        {scopeOptions.length > 0 ? (
          <FacetedFilter onToggle={toggleScope} options={scopeOptions} selectedValues={selectedScopes} title="Scope" />
        ) : null}

        {/* Clear filters */}
        {hasFilters ? (
          <Button aria-label="Clear filters" className="h-8 px-2 lg:px-3" onClick={clearFilters} variant="ghost">
            <X className="h-4 w-4" />
          </Button>
        ) : null}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Log count */}
        <Text className="min-w-[100px] text-right" variant="muted">
          {filteredLogs.length} {filteredLogs.length === 1 ? 'log' : 'logs'}
          {hasFilters && logs.length !== filteredLogs.length ? ` (${logs.length} total)` : ''}
        </Text>

        {/* Refresh button */}
        {onRefresh ? (
          <Button aria-label="Refresh logs" disabled={isLoading} onClick={onRefresh} size="icon" variant="ghost">
            {isLoading ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        ) : null}
      </div>

      {/* Error state */}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Loading state */}
      {isLoading && logs.length === 0 ? <LogRowsSkeleton rows={8} /> : null}

      {/* Empty state */}
      {!isLoading && logs.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : null}

      {/* Logs list with ListView components */}
      {logs.length > 0 ? (
        <div className="overflow-auto" style={{ maxHeight }}>
          <ListViewGroup>
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => {
                const logKey = getLogKey(log);
                const isNew = newLogKeys.has(logKey);
                const isSelected = selectedLog ? getLogKey(selectedLog) === logKey : false;
                const rawMessage = log.content?.message ?? log.content?.msg;
                const stringifiedMessage = rawMessage ? JSON.stringify(rawMessage) : '';
                const message = typeof rawMessage === 'string' ? rawMessage : stringifiedMessage;

                return (
                  <ListView
                    key={logKey}
                    className={cn(
                      isNew && 'animate-log-highlight',
                      isSelected && 'bg-muted',
                      log.level === 'ERROR' && 'bg-red-50/30 dark:bg-red-950/10',
                      log.level === 'WARN' && 'bg-yellow-50/30 dark:bg-yellow-950/10'
                    )}
                    onClick={() => setSelectedLog(log)}
                  >
                    <ListViewStart>
                      <div className="flex items-center gap-2">
                        <Text className="text-muted-foreground" variant="small">
                          {formatTimestampShort(log.timestamp)}
                        </Text>
                        <LogLevelBadge level={log.level} />
                      </div>
                    </ListViewStart>
                    <ListViewIntermediary>
                      <Text className="truncate text-muted-foreground" variant="small">
                        {formatPath(log.path)}
                      </Text>
                    </ListViewIntermediary>
                    <ListViewEnd>
                      <Text className="truncate font-mono">{message || '[No message]'}</Text>
                    </ListViewEnd>
                  </ListView>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm">No logs match the current filters</p>
                <Button className="mt-2" onClick={clearFilters} size="sm" variant="ghost">
                  Clear filters
                </Button>
              </div>
            )}
          </ListViewGroup>
        </div>
      ) : null}

      {/* Streaming indicator */}
      {isLoading && logs.length > 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading more logs...</span>
        </div>
      ) : null}

      {/* Log detail sheet */}
      <Sheet onOpenChange={(open) => !open && setSelectedLog(null)} open={selectedLog !== null}>
        <SheetContent side="right" size="lg">
          {selectedLog ? <LogDetailSheet idLabel={idLabel} log={selectedLog} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}) as <T extends ParsedLogEntry>(props: LogExplorerProps<T>) => JSX.Element;

// Log detail sheet content
type LogDetailSheetProps = {
  log: ParsedLogEntry;
  idLabel?: string;
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

const LogDetailSheet = memo(({ log, idLabel = 'ID' }: LogDetailSheetProps) => {
  const rawMessage = log.content?.message ?? log.content?.msg;
  const stringifiedMessage = rawMessage ? JSON.stringify(rawMessage) : '';
  const message = typeof rawMessage === 'string' ? rawMessage : stringifiedMessage;
  const contentJson = log.content ? JSON.stringify(log.content, null, 2) : '';

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="mb-6">
        <SheetTitle>Log Details</SheetTitle>
      </SheetHeader>

      <ScrollArea className="flex-1 pr-4">
        <div className="flex flex-col gap-6">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-2">
            <LogLevelBadge level={log.level} size="md" />
            <Badge size="md" variant="neutral-outline">
              {log.path ?? 'root'}
            </Badge>
            <span className="font-mono text-muted-foreground text-sm">{formatTimestamp(log.timestamp)}</span>
          </div>

          {/* Message */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Text variant="label">Message</Text>
              <CopyButton content={message} size="sm" variant="ghost" />
            </div>
            <DynamicCodeBlock code={message} lang="json" />
          </div>

          {/* Metadata */}
          <div>
            <Text className="mb-2 block" variant="label">
              Metadata
            </Text>
            <div className="grid gap-2 rounded-md bg-muted p-3 text-sm">
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <Text variant="muted">{idLabel}:</Text>
                <span className="font-mono">{log.id || '-'}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <Text variant="muted">Partition:</Text>
                <span className="font-mono">{log.partitionId}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <Text variant="muted">Offset:</Text>
                <span className="font-mono">{log.offset.toString()}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <Text variant="muted">Scope:</Text>
                <span className="font-mono">{log.scope}</span>
              </div>
              {log.path ? (
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <Text variant="muted">Path:</Text>
                  <span className="font-mono">{log.path}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Raw payload */}
          <div>
            <Text className="mb-2 block" variant="label">
              Raw Payload
            </Text>
            <LogPayload label="" maxLength={5000} payload={log.message.value} />
          </div>

          {/* Full content JSON */}
          {log.content ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Text variant="label">Full Content (JSON)</Text>
                <CopyButton content={contentJson} size="sm" variant="ghost" />
              </div>
              <DynamicCodeBlock code={contentJson} lang="json" />
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
});

LogDetailSheet.displayName = 'LogDetailSheet';
