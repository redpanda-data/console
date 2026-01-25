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

import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from 'components/redpanda-ui/components/command';
import { Input } from 'components/redpanda-ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { ScrollArea } from 'components/redpanda-ui/components/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from 'components/redpanda-ui/components/sheet';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertCircle, Copy, FilterIcon, Loader2, RefreshCw, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_SCOPE_OPTIONS } from './constants';
import { LogLevelBadge } from './log-level-badge';
import { LogPayload } from './log-payload';
import { LogRow } from './log-row';
import { DEFAULT_LEVEL_OPTIONS, type LogLevel, type ParsedLogEntry, type ScopeOption } from './types';

/** Duration in ms for the "new row" highlight animation */
const NEW_ROW_HIGHLIGHT_DURATION = 3000;

/** Fixed row height for virtualization */
const ROW_HEIGHT = 40;

/** Number of rows to render outside the visible area (overscan) */
const OVERSCAN_COUNT = 10;

type LogExplorerProps<T extends ParsedLogEntry = ParsedLogEntry> = {
  /** Parsed log entries to display */
  logs: T[];
  /** Whether the logs are currently loading/streaming */
  isLoading?: boolean;
  /** Error message if loading failed */
  error?: string | null;
  /** Callback to refresh/restart the log stream */
  onRefresh?: () => void;
  /** Whether to show the ID column (e.g., for multi-source views) */
  showId?: boolean;
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
  showId = false,
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

  // Scroll container ref for virtualization
  const parentRef = useRef<HTMLDivElement>(null);

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

  // Virtualizer for the log list - using fixed row height
  const virtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN_COUNT,
  });

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

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <Input
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
          <Button className="h-8 px-2 lg:px-3" onClick={clearFilters} variant="ghost">
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        ) : null}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Refresh button */}
        {onRefresh ? (
          <Button className="h-8" disabled={isLoading} onClick={onRefresh} size="sm" variant="outline">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        ) : null}

        {/* Log count */}
        <span className="text-muted-foreground text-xs">
          {filteredLogs.length} {filteredLogs.length === 1 ? 'log' : 'logs'}
          {hasFilters && logs.length !== filteredLogs.length ? ` (${logs.length} total)` : ''}
        </span>
      </div>

      {/* Error state */}
      {error ? (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
          <span className="text-red-700 text-sm dark:text-red-300">{error}</span>
        </div>
      ) : null}

      {/* Loading state */}
      {isLoading && logs.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton className="h-10 w-full" key={`skeleton-${i.toString()}`} />
          ))}
        </div>
      ) : null}

      {/* Empty state */}
      {!isLoading && logs.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : null}

      {/* Virtualized logs list */}
      {logs.length > 0 ? (
        <div className="overflow-auto rounded-md border" ref={parentRef} style={{ maxHeight }}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualRow) => {
              const log = filteredLogs[virtualRow.index];
              const logKey = getLogKey(log);
              const isNew = newLogKeys.has(logKey);
              const isSelected = selectedLog ? getLogKey(selectedLog) === logKey : false;

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <LogRow
                    className={cn(isNew && 'animate-log-highlight')}
                    isSelected={isSelected}
                    log={log}
                    onClick={() => setSelectedLog(log)}
                    showId={showId}
                  />
                </div>
              );
            })}
          </div>

          {/* Empty filtered state */}
          {filteredLogs.length === 0 && hasFilters ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">No logs match the current filters</p>
              <Button className="mt-2" onClick={clearFilters} size="sm" variant="ghost">
                Clear filters
              </Button>
            </div>
          ) : null}
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

const LogDetailSheet = memo(({ log, idLabel = 'ID' }: LogDetailSheetProps) => {
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

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

  const rawMessage = log.content?.message ?? log.content?.msg;
  const message = typeof rawMessage === 'string' ? rawMessage : rawMessage ? JSON.stringify(rawMessage, null, 2) : '';

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
              {log.path || 'root'}
            </Badge>
            <span className="font-mono text-muted-foreground text-sm">{formatTimestamp(log.timestamp)}</span>
          </div>

          {/* Message */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-sm">Message</span>
              <Button className="h-6 px-2" onClick={() => copyToClipboard(message)} size="sm" variant="ghost">
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </Button>
            </div>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">
              {message || '[No message]'}
            </pre>
          </div>

          {/* Metadata */}
          <div>
            <span className="mb-2 block font-medium text-sm">Metadata</span>
            <div className="grid gap-2 rounded-md bg-muted p-3 text-sm">
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-muted-foreground">{idLabel}:</span>
                <span className="font-mono">{log.id || '-'}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-muted-foreground">Partition:</span>
                <span className="font-mono">{log.partitionId}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-muted-foreground">Offset:</span>
                <span className="font-mono">{log.offset.toString()}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-muted-foreground">Scope:</span>
                <span className="font-mono">{log.scope}</span>
              </div>
              {log.path ? (
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-muted-foreground">Path:</span>
                  <span className="font-mono">{log.path}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Raw payload */}
          <div>
            <span className="mb-2 block font-medium text-sm">Raw Payload</span>
            <LogPayload label="" maxLength={5000} payload={log.message.value} />
          </div>

          {/* Full content JSON */}
          {log.content ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-sm">Full Content (JSON)</span>
                <Button
                  className="h-6 px-2"
                  onClick={() => copyToClipboard(JSON.stringify(log.content, null, 2))}
                  size="sm"
                  variant="ghost"
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy
                </Button>
              </div>
              <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">
                {JSON.stringify(log.content, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
});

LogDetailSheet.displayName = 'LogDetailSheet';

// Faceted filter component (simplified version from DataTable)
type FacetedFilterProps<T extends string> = {
  title: string;
  options: { value: T; label: string }[];
  selectedValues: T[];
  onToggle: (value: T) => void;
};

const FacetedFilter = memo(<T extends string>({ title, options, selectedValues, onToggle }: FacetedFilterProps<T>) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button className="h-8 border-dashed" size="sm" variant="outline">
        <FilterIcon className="mr-2 h-4 w-4" />
        {title}
        {selectedValues.length > 0 ? (
          <>
            <span className="mx-2 h-4 w-px bg-border" />
            <div className="flex gap-1">
              {selectedValues.length <= 2 ? (
                selectedValues.map((value) => (
                  <Badge key={value} size="sm" variant="simple">
                    {options.find((o) => o.value === value)?.label ?? value}
                  </Badge>
                ))
              ) : (
                <Badge size="sm" variant="simple">
                  {selectedValues.length} selected
                </Badge>
              )}
            </div>
          </>
        ) : null}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[200px] p-0">
      <Command>
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup>
            {options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <CommandItem key={option.value} onSelect={() => onToggle(option.value)}>
                  <div
                    className={cn(
                      'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                      isSelected ? 'bg-primary text-primary-foreground' : 'opacity-50 [&_svg]:invisible'
                    )}
                  >
                    <Checkbox checked={isSelected} className="h-3 w-3" />
                  </div>
                  <span>{option.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          {selectedValues.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  className="justify-center text-center"
                  onSelect={() => {
                    for (const v of selectedValues) {
                      onToggle(v);
                    }
                  }}
                >
                  Clear filters
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
));

// Need to use a type assertion for memo with generics
(FacetedFilter as { displayName?: string }).displayName = 'FacetedFilter';
