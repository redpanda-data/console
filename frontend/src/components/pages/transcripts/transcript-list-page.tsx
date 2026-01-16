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

import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import {
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTableFacetedFilter } from 'components/redpanda-ui/components/data-table';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { ArrowLeft, Database, RefreshCw, X } from 'lucide-react';
import { runInAction } from 'mobx';
import { parseAsString, useQueryState } from 'nuqs';
import type { TraceHistogram, TraceSummary } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { ChangeEvent, FC } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useListTracesQuery } from 'react-query/api/tracing';
import { appGlobal } from 'state/app-global';
import { uiState } from 'state/ui-state';
import { pluralize } from 'utils/string';

import { TranscriptActivityChart } from './components/transcript-activity-chart';
import { type EnhancedTranscriptSummary, statusOptions, TranscriptsTable } from './components/transcripts-table';
import { calculateVisibleWindow } from './utils/transcript-statistics';

const TIME_RANGES = [
  { value: '5m', label: 'Last 5 minutes', ms: 5 * 60 * 1000 },
  { value: '15m', label: 'Last 15 minutes', ms: 15 * 60 * 1000 },
  { value: '30m', label: 'Last 30 minutes', ms: 30 * 60 * 1000 },
  { value: '1h', label: 'Last 1 hour', ms: 60 * 60 * 1000 },
  { value: '3h', label: 'Last 3 hours', ms: 3 * 60 * 60 * 1000 },
  { value: '6h', label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000 },
  { value: '12h', label: 'Last 12 hours', ms: 12 * 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
];

/** Props for the stats row component */
type TranscriptsStatsRowProps = {
  isLoading: boolean;
  isInitialLoad: boolean;
  stats: { completed: number; inProgress: number; withErrors: number; total: number };
  onCollapseAll: () => void;
};

/** Stats row showing transcript counts and collapse button */
const TranscriptsStatsRow: FC<TranscriptsStatsRowProps> = ({ isLoading, isInitialLoad, stats, onCollapseAll }) => {
  if (isLoading && isInitialLoad) {
    return (
      <div className="flex items-center justify-between px-1 text-muted-foreground text-xs">
        <span className="flex items-center gap-2">
          <Spinner size="xs" />
          Loading transcripts...
        </span>
        <div className="flex items-center gap-3">
          <Button className="h-6 px-2 text-[10px]" onClick={onCollapseAll} size="sm" variant="ghost">
            Collapse all
          </Button>
        </div>
      </div>
    );
  }

  const hasAnomalies = stats.withErrors > 0 || stats.inProgress > 0;

  return (
    <div className="flex items-center justify-between px-1 text-muted-foreground text-xs">
      <span>
        Showing {stats.total} {pluralize(stats.total, 'transcript')}
        {hasAnomalies ? (
          <span className="text-muted-foreground/70">
            {' '}
            ({stats.completed} completed
            {stats.withErrors > 0 ? `, ${stats.withErrors} with errors` : null}
            {stats.inProgress > 0 ? `, ${stats.inProgress} in-progress` : null})
          </span>
        ) : null}
      </span>
      <div className="flex items-center gap-3">
        <Button className="h-6 px-2 text-[10px]" onClick={onCollapseAll} size="sm" variant="ghost">
          Collapse all
        </Button>
      </div>
    </div>
  );
};

/** Props for load more button */
type LoadMoreButtonProps = {
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
};

/** Load more button for pagination */
const LoadMoreButton: FC<LoadMoreButtonProps> = ({ hasMore, isLoading, isLoadingMore, onLoadMore }) => {
  if (!((hasMore && !isLoading) || isLoadingMore)) {
    return null;
  }

  return (
    <div className="flex justify-center py-2">
      <Button className="gap-2" disabled={isLoadingMore} onClick={onLoadMore} size="sm" variant="outline">
        {isLoadingMore ? (
          <>
            <Spinner size="xs" />
            Loading...
          </>
        ) : (
          'Load 100 older transcripts'
        )}
      </Button>
    </div>
  );
};

/** Props for trace list toolbar */
type TraceListToolbarProps = {
  jumpedTo: JumpedState;
  onBackToNewest: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  serviceColumn: ReturnType<typeof useReactTable<EnhancedTranscriptSummary>>['getColumn'] extends (
    id: string
  ) => infer R
    ? R
    : never;
  statusColumn: ReturnType<typeof useReactTable<EnhancedTranscriptSummary>>['getColumn'] extends (id: string) => infer R
    ? R
    : never;
  serviceOptions: { value: string; label: string; icon: typeof Database }[];
  isFiltered: boolean;
  onResetFilters: () => void;
  timeRange: string;
  onTimeRangeChange: (value: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
};

/** State for tracking jumped-to time range */
type JumpedState = {
  startMs: number;
  endMs: number;
  label: string;
} | null;

/** Toolbar component for trace list page */
const TraceListToolbar: FC<TraceListToolbarProps> = ({
  jumpedTo,
  onBackToNewest,
  searchValue,
  onSearchChange,
  serviceColumn,
  statusColumn,
  serviceOptions,
  isFiltered,
  onResetFilters,
  timeRange,
  onTimeRangeChange,
  isLoading,
  onRefresh,
}) => (
  <div className="flex items-center justify-between gap-2">
    <div className="flex flex-1 items-center gap-2">
      {jumpedTo !== null ? (
        <Button className="h-8 gap-1.5" onClick={onBackToNewest} size="sm" variant="outline">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to newest
        </Button>
      ) : null}
      <Input
        className="h-8 w-[300px]"
        onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
        placeholder="Search transcripts..."
        value={searchValue}
      />
      {serviceColumn && serviceOptions.length > 0 ? (
        <DataTableFacetedFilter column={serviceColumn} options={serviceOptions} title="Service" />
      ) : null}
      {statusColumn ? <DataTableFacetedFilter column={statusColumn} options={statusOptions} title="Status" /> : null}
      {isFiltered ? (
        <Button onClick={onResetFilters} size="sm" variant="ghost">
          Reset
          <X className="ml-2 h-4 w-4" />
        </Button>
      ) : null}
    </div>
    <div className="flex items-center gap-2">
      {jumpedTo !== null ? (
        <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">Viewing: {jumpedTo.label}</span>
      ) : null}
      <Select disabled={jumpedTo !== null} onValueChange={onTimeRangeChange} value={timeRange}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue placeholder="Time range" />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGES.map((range) => (
            <SelectItem key={range.value} value={range.value}>
              {range.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button className="h-8 w-8" disabled={isLoading} onClick={onRefresh} size="icon" variant="outline">
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  </div>
);

type TranscriptListPageProps = {
  /**
   * Disable expensive table features (faceting) for testing or performance.
   * When true, getFacetedRowModel and getFacetedUniqueValues are not used.
   * This significantly reduces memory consumption in tests.
   * @default false
   */
  disableFaceting?: boolean;
};

export const TranscriptListPage: FC<TranscriptListPageProps> = ({ disableFaceting = false }) => {
  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Transcripts';
      uiState.pageBreadcrumbs = [{ title: 'Transcripts', linkTo: '', heading: 'Transcripts' }];
    });
  }, []);

  const [selectedTraceId, setSelectedTraceId] = useQueryState('traceId', parseAsString);
  const [selectedSpanId, setSelectedSpanId] = useQueryState('spanId', parseAsString);
  const [timeRange, setTimeRange] = useQueryState('timeRange', parseAsString.withDefault('1h'));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Lazy loading state
  const [accumulatedTraces, setAccumulatedTraces] = useState<TraceSummary[]>([]);
  const [currentPageToken, setCurrentPageToken] = useState<string>('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Jump navigation state
  const [jumpedTo, setJumpedTo] = useState<JumpedState>(null);

  // Histogram from initial load (not affected by load more or jumps)
  const [initialHistogram, setInitialHistogram] = useState<TraceHistogram | undefined>(undefined);
  const [initialTotalCount, setInitialTotalCount] = useState(0);
  const hasInitializedRef = useRef(false);

  const selectedRange = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[3];

  // Consolidated reset function for query state
  // Used by refresh, time range change, and back-to-newest actions
  const resetQueryState = useCallback(() => {
    setAccumulatedTraces([]);
    setCurrentPageToken('');
    setJumpedTo(null);
    setInitialHistogram(undefined);
    setInitialTotalCount(0);
    hasInitializedRef.current = false;
  }, []);

  // Handle time range changes from the Select component
  // This replaces the useEffect approach to prevent double-queries from nuqs hydration
  const handleTimeRangeChange = useCallback(
    (value: string) => {
      setTimeRange(value);
      setNowMs(Date.now());
      resetQueryState();
      // No refetch() needed - changing nowMs updates the query key, triggering automatic refetch
    },
    [setTimeRange, resetQueryState]
  );

  // Calculate query timestamps based on whether we're in jumped mode
  const timestamps = useMemo(() => {
    if (jumpedTo) {
      return {
        startTimestamp: timestampFromMs(jumpedTo.startMs),
        endTimestamp: timestampFromMs(jumpedTo.endMs),
        startMs: jumpedTo.startMs,
        endMs: jumpedTo.endMs,
      };
    }
    const startMs = nowMs - selectedRange.ms;
    return {
      startTimestamp: timestampFromMs(startMs),
      endTimestamp: timestampFromMs(nowMs),
      startMs,
      endMs: nowMs,
    };
  }, [nowMs, selectedRange.ms, jumpedTo]);

  // Query for the main time range (or jumped range)
  const { data, isLoading, error } = useListTracesQuery({
    startTime: timestamps.startTimestamp,
    endTime: timestamps.endTimestamp,
    pageSize: 100,
    pageToken: currentPageToken,
  });

  // Store initial histogram and total count from first load
  useEffect(() => {
    if (data && !hasInitializedRef.current && !jumpedTo) {
      setInitialHistogram(data.histogram);
      setInitialTotalCount(data.totalCount);
      hasInitializedRef.current = true;
    }
  }, [data, jumpedTo]);

  // Accumulate traces when data changes
  // Note: Don't include currentPageToken in deps - it changes before data arrives,
  // which would cause the effect to re-run with stale data and duplicate traces
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentPageToken is intentionally excluded - see comment above
  useEffect(() => {
    if (!data?.traces) {
      return;
    }

    setAccumulatedTraces((prev) => (currentPageToken === '' ? data.traces : [...prev, ...data.traces]));
    setIsLoadingMore(false);
  }, [data]);

  // Connect the global refresh button to this page's refresh logic
  useEffect(() => {
    const previousHandler = appGlobal.onRefresh;
    appGlobal.onRefresh = () => {
      // Update the time window to "now" and reset state
      // No refetch() needed - changing nowMs updates the query key, triggering automatic refetch
      setNowMs(Date.now());
      resetQueryState();
    };
    return () => {
      // Restore previous handler on unmount
      appGlobal.onRefresh = previousHandler;
    };
  }, [resetQueryState]);

  useEffect(() => {
    setSelectedTraceId(null);
    setSelectedSpanId(null);
  }, [setSelectedTraceId, setSelectedSpanId]);

  // Use accumulated traces for display
  const displayTraces = accumulatedTraces;

  const tracesStats = useMemo(() => {
    const traces = displayTraces;
    const completed = traces.filter((t) => t.errorCount === 0 && t.spanCount > 0).length;
    const inProgress = traces.filter((t) => t.spanCount === 0).length;
    const withErrors = traces.filter((t) => t.errorCount > 0).length;
    return { completed, inProgress, withErrors, total: traces.length };
  }, [displayTraces]);

  // Enhance traces with searchable field and status for filtering
  const enhancedTraces = useMemo(
    () =>
      displayTraces.map((trace): EnhancedTranscriptSummary => {
        let status: EnhancedTranscriptSummary['status'];
        if (trace.errorCount > 0) {
          status = 'with-errors';
        } else if (trace.spanCount === 0) {
          status = 'in-progress';
        } else {
          status = 'completed';
        }

        return {
          ...trace,
          searchable: `${trace.traceId} ${trace.rootSpanName} ${trace.rootServiceName}`,
          status,
        };
      }),
    [displayTraces]
  );

  // Stable filter functions to prevent table model rebuilds
  const serviceNameFilterFn = useCallback(
    (row: { getValue: (id: string) => string }, id: string, value: string[]) => value.includes(row.getValue(id)),
    []
  );

  const statusFilterFn = useCallback(
    (row: { getValue: (id: string) => string }, id: string, value: string[]) => value.includes(row.getValue(id)),
    []
  );

  // Memoize columns array to prevent recreation on every render
  const columns = useMemo<ColumnDef<EnhancedTranscriptSummary>[]>(
    () => [
      {
        accessorKey: 'searchable',
        filterFn: 'includesString',
      },
      {
        accessorKey: 'rootServiceName',
        filterFn: serviceNameFilterFn,
      },
      {
        accessorKey: 'status',
        filterFn: statusFilterFn,
      },
    ],
    [serviceNameFilterFn, statusFilterFn]
  );

  // Memoize table state to prevent recreation on every render
  const tableState = useMemo(
    () => ({
      columnFilters,
    }),
    [columnFilters]
  );

  // Create table instance for toolbar filters
  const table = useReactTable<EnhancedTranscriptSummary>({
    data: enhancedTraces,
    columns,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    state: tableState,
  });

  // Generate service name options from ALL traces (not filtered)
  const serviceOptions = useMemo(() => {
    const uniqueServices = new Set<string>();
    for (const trace of displayTraces) {
      if (trace.rootServiceName) {
        uniqueServices.add(trace.rootServiceName);
      }
    }
    return Array.from(uniqueServices)
      .sort()
      .map((serviceName) => ({
        value: serviceName,
        label: serviceName,
        icon: Database,
      }));
  }, [displayTraces]);

  const isFiltered = columnFilters.length > 0;

  const handleRefresh = () => {
    // Update the time window to "now" and reset state
    // No refetch() needed - changing nowMs updates the query key, triggering automatic refetch
    setNowMs(Date.now());
    resetQueryState();
  };

  const handleLoadMore = () => {
    if (!data?.nextPageToken || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    setCurrentPageToken(data.nextPageToken);
    // The query will automatically refetch with the new page token
    // isLoadingMore will be reset when data arrives via useEffect
  };

  const handleBucketClick = (bucketStartMs: number, bucketEndMs: number) => {
    // Jump to the clicked bucket's time range
    const startDate = new Date(bucketStartMs);
    const endDate = new Date(bucketEndMs);
    const label = `${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

    setJumpedTo({
      startMs: bucketStartMs,
      endMs: bucketEndMs,
      label,
    });
    // Reset pagination
    setAccumulatedTraces([]);
    setCurrentPageToken('');
  };

  const handleBackToNewest = () => {
    setNowMs(Date.now());
    resetQueryState();
  };

  const handleSpanClick = (traceId: string, spanId: string) => {
    setSelectedTraceId(traceId);
    setSelectedSpanId(spanId);
  };

  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);

  const handleCollapseAll = () => {
    // Trigger collapse all by incrementing counter
    setCollapseAllTrigger((prev) => prev + 1);
  };

  // Calculate the actual visible window from accumulated traces
  const visibleWindow = useMemo(() => calculateVisibleWindow(accumulatedTraces), [accumulatedTraces]);

  // Use initial histogram for display (shows full query range distribution)
  // When in jumped mode, use current data's histogram
  const displayHistogram = jumpedTo ? data?.histogram : initialHistogram;
  const displayTotalCount = jumpedTo ? (data?.totalCount ?? 0) : initialTotalCount;

  return (
    <div className="flex flex-col gap-4">
      {/* Page Description */}
      <div>
        <p className="text-muted-foreground text-sm">
          Inspect LLM calls, tool invocations, and nested spans from your AI agents
        </p>
      </div>

      {/* Toolbar with Search Controls and Time Range */}
      <TraceListToolbar
        isFiltered={isFiltered}
        isLoading={isLoading}
        jumpedTo={jumpedTo}
        onBackToNewest={handleBackToNewest}
        onRefresh={handleRefresh}
        onResetFilters={() => table.resetColumnFilters()}
        onSearchChange={(value) => table.getColumn('searchable')?.setFilterValue(value)}
        onTimeRangeChange={handleTimeRangeChange}
        searchValue={(table.getColumn('searchable')?.getFilterValue() as string) ?? ''}
        serviceColumn={table.getColumn('rootServiceName')}
        serviceOptions={serviceOptions}
        statusColumn={table.getColumn('status')}
        timeRange={timeRange}
      />

      {/* Activity Chart - Always show when we have histogram data */}
      {displayHistogram && displayHistogram.buckets.length > 0 && (
        <TranscriptActivityChart
          histogram={displayHistogram}
          loadedCount={accumulatedTraces.length}
          onBucketClick={jumpedTo ? undefined : handleBucketClick}
          queryEndMs={jumpedTo ? jumpedTo.endMs : timestamps.endMs}
          queryStartMs={jumpedTo ? jumpedTo.startMs : timestamps.startMs}
          returnedEndTime={visibleWindow.endMs > 0 ? timestampFromMs(visibleWindow.endMs) : undefined}
          returnedStartTime={visibleWindow.startMs > 0 ? timestampFromMs(visibleWindow.startMs) : undefined}
          totalCount={displayTotalCount}
        />
      )}

      {/* Stats row and table grouped together with minimal gap */}
      <div className="flex flex-col gap-2">
        {/* Traces Summary (only show when we have data) */}
        {displayTraces.length > 0 && (
          <TranscriptsStatsRow
            isInitialLoad={currentPageToken === ''}
            isLoading={isLoading}
            onCollapseAll={handleCollapseAll}
            stats={tracesStats}
          />
        )}

        {/* Traces Table with external toolbar */}
        <TranscriptsTable
          collapseAllTrigger={collapseAllTrigger}
          columnFilters={columnFilters}
          disableFaceting={disableFaceting}
          error={error}
          hasUnfilteredData={Boolean(displayTraces.length > 0)}
          hideToolbar
          isLoading={isLoading && currentPageToken === ''}
          onSpanClick={handleSpanClick}
          selectedSpanId={selectedSpanId}
          selectedTraceId={selectedTraceId}
          setColumnFilters={setColumnFilters}
          setSelectedSpanId={setSelectedSpanId}
          setSelectedTraceId={setSelectedTraceId}
          timeRange={jumpedTo ? jumpedTo.label : selectedRange.label}
          traces={displayTraces}
        />

        {/* Load More Button */}
        <LoadMoreButton
          hasMore={Boolean(data?.nextPageToken)}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
        />
      </div>
    </div>
  );
};
