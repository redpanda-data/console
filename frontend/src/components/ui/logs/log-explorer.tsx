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
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertCircle, FilterIcon, Loader2, RefreshCw, X } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';

import { DEFAULT_SCOPE_OPTIONS } from './constants';
import { LogRow } from './log-row';
import { DEFAULT_LEVEL_OPTIONS, type LogLevel, type ParsedLogEntry, type ScopeOption } from './types';

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
 * A reusable log explorer component with filtering, search, and scrolling.
 * Works with any data conforming to ParsedLogEntry interface.
 *
 * @example
 * ```tsx
 * // Basic usage with pipeline logs
 * const { logs, isStreaming, error, reset } = usePipelineLogs({ pipelineId });
 *
 * <LogExplorer
 *   logs={logs}
 *   isLoading={isStreaming}
 *   error={error?.message}
 *   onRefresh={reset}
 * />
 *
 * // With custom scope options
 * <LogExplorer
 *   logs={logs}
 *   scopeOptions={[
 *     { value: 'producer', label: 'Producer' },
 *     { value: 'consumer', label: 'Consumer' },
 *   ]}
 * />
 * ```
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Component has multiple filter states and rendering conditions
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
  scopeOptions = DEFAULT_SCOPE_OPTIONS as ScopeOption[],
  searchFilter,
}: LogExplorerProps<T>) {
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

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

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <Input
          className="h-8 w-[200px]"
          placeholder="Search logs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {/* Level filter */}
        <FacetedFilter
          options={DEFAULT_LEVEL_OPTIONS}
          selectedValues={selectedLevels}
          title="Level"
          onToggle={toggleLevel as (value: string) => void}
        />

        {/* Scope filter - only show if scopeOptions has items */}
        {scopeOptions.length > 0 ? (
          <FacetedFilter
            options={scopeOptions}
            selectedValues={selectedScopes}
            title="Scope"
            onToggle={toggleScope}
          />
        ) : null}

        {/* Clear filters */}
        {hasFilters ? (
          <Button className="h-8 px-2 lg:px-3" variant="ghost" onClick={clearFilters}>
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        ) : null}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Refresh button */}
        {onRefresh ? (
          <Button className="h-8" disabled={isLoading} size="sm" variant="outline" onClick={onRefresh}>
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

      {/* Logs list */}
      {logs.length > 0 ? (
        <ScrollArea className="rounded-md border" style={{ maxHeight }}>
          <div className="min-w-0">
            {filteredLogs.map((log) => (
              <LogRow
                idLabel={idLabel}
                key={`${log.partitionId}-${log.offset.toString()}`}
                log={log}
                showId={showId}
              />
            ))}
            {filteredLogs.length === 0 && hasFilters ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm">No logs match the current filters</p>
                <Button className="mt-2" size="sm" variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      ) : null}

      {/* Streaming indicator */}
      {isLoading && logs.length > 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading more logs...</span>
        </div>
      ) : null}
    </div>
  );
}) as <T extends ParsedLogEntry>(props: LogExplorerProps<T>) => JSX.Element;

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
