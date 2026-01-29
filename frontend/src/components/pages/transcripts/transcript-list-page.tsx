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
import { Heading, Small, Text } from 'components/redpanda-ui/components/typography';
import { ArrowLeft, Database, RefreshCw, X } from 'lucide-react';
import { runInAction } from 'mobx';
import { parseAsString, useQueryStates } from 'nuqs';
import type { TraceSummary } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { ChangeEvent, FC } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGetTraceHistogramQuery, useGetTraceQuery, useListTracesQuery } from 'react-query/api/tracing';
import { ONE_MINUTE } from 'react-query/react-query.utils';
import { appGlobal } from 'state/app-global';
import { uiState } from 'state/ui-state';
import { pluralize } from 'utils/string';

import { LinkedTraceBanner } from './components/linked-trace-banner';
import { TranscriptActivityChart, TranscriptActivityChartSkeleton } from './components/transcript-activity-chart';
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

export const TRANSCRIPTS_PAGE_SIZE = 100;

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Transcripts';
    uiState.pageBreadcrumbs.pop();
    uiState.pageBreadcrumbs.push({
      title: 'Transcripts',
      linkTo: '/transcripts',
      heading: 'Transcripts',
    });
  });
};

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
      <div className="flex items-center justify-between px-1">
        <Text as="span" className="flex items-center gap-2" variant="muted">
          <Spinner size="xs" />
          Loading transcripts...
        </Text>
        <div className="flex items-center gap-3">
          <Button className="h-6 px-2" onClick={onCollapseAll} size="sm" variant="ghost">
            <Text as="span" variant="muted">
              Collapse all
            </Text>
          </Button>
        </div>
      </div>
    );
  }

  const hasAnomalies = stats.withErrors > 0 || stats.inProgress > 0;

  return (
    <div className="flex items-center justify-between px-1">
      <Text as="span" variant="muted">
        Showing {stats.total} {pluralize(stats.total, 'transcript')}
        {hasAnomalies ? (
          <span className="text-muted-foreground/70">
            {' '}
            ({stats.completed} completed
            {stats.withErrors > 0 ? `, ${stats.withErrors} with errors` : null}
            {stats.inProgress > 0 ? `, ${stats.inProgress} in-progress` : null})
          </span>
        ) : null}
      </Text>
      <div className="flex items-center gap-3">
        <Button className="h-6 px-2" onClick={onCollapseAll} size="sm" variant="ghost">
          <Text as="span" variant="muted">
            Collapse all
          </Text>
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
        <Small className="rounded bg-muted px-2 py-1 text-muted-foreground">Viewing: {jumpedTo.label}</Small>
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
  // URL state - batched for efficient updates
  const [urlState, setUrlState] = useQueryStates({
    traceId: parseAsString,
    spanId: parseAsString,
    tab: parseAsString,
    timeRange: parseAsString.withDefault('1h'),
  });
  const { traceId: selectedTraceId, spanId: selectedSpanId, timeRange } = urlState;

  // Wrapper setters for components that need individual setters
  const setSelectedTraceId = useCallback((value: string | null) => setUrlState({ traceId: value }), [setUrlState]);
  const setSelectedSpanId = useCallback((value: string | null) => setUrlState({ spanId: value }), [setUrlState]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  // Lazy loading state
  const [accumulatedTraces, setAccumulatedTraces] = useState<TraceSummary[]>([]);
  const [currentPageToken, setCurrentPageToken] = useState<string>('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Jump navigation state
  const [jumpedTo, setJumpedTo] = useState<JumpedState>(null);

  // Linked trace state - for showing traces from URL that aren't in current results
  // This mode is ONLY entered when the page initially loads with a traceId in the URL
  const [isLinkedTraceMode, setIsLinkedTraceMode] = useState(false);
  const linkedTraceIdRef = useRef<string | null>(null);
  const hasCompletedInitialMount = useRef(false);

  const selectedRange = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[3];

  useEffect(() => {
    updatePageTitle();
  }, []);

  // Consolidated reset function for query state
  // Used by refresh, time range change, and back-to-newest actions
  const resetQueryState = useCallback(() => {
    setAccumulatedTraces([]);
    setCurrentPageToken('');
    setJumpedTo(null);
    // Clear span selection - selected span may not exist in new data (batched URL update)
    setUrlState({ traceId: null, spanId: null, tab: null });
    // Clear linked trace state
    setIsLinkedTraceMode(false);
    linkedTraceIdRef.current = null;
  }, [setUrlState]);

  // Handle time range changes from the Select component
  // This replaces the useEffect approach to prevent double-queries from nuqs hydration
  const handleTimeRangeChange = useCallback(
    (value: string) => {
      setUrlState({ timeRange: value });
      setNowMs(Date.now());
      resetQueryState();
      // No refetch() needed - changing nowMs updates the query key, triggering automatic refetch
    },
    [setUrlState, resetQueryState]
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
  // In linked trace mode, skip this query - we use useGetTraceQuery instead
  const {
    data,
    isLoading: isListTracesLoading,
    error,
  } = useListTracesQuery(
    {
      pageSize: TRANSCRIPTS_PAGE_SIZE,
      pageToken: currentPageToken,
      filter: {
        startTime: timestamps.startTimestamp,
        endTime: timestamps.endTimestamp,
      },
    },
    { enabled: !isLinkedTraceMode }
  );

  // Query for full trace details (for linked mode - to get all spans and summary)
  const { data: linkedTraceData, isLoading: isLinkedTraceLoading } = useGetTraceQuery(
    isLinkedTraceMode ? selectedTraceId : null,
    { enabled: isLinkedTraceMode && !!selectedTraceId }
  );

  // Combined loading state - use linked trace loading when in linked mode
  const isLoading = isLinkedTraceMode ? isLinkedTraceLoading : isListTracesLoading;

  // Derive active trace timestamp for histogram marker - works in both linked and normal mode
  const activeTraceTimeMs = useMemo(() => {
    if (isLinkedTraceMode && linkedTraceData?.trace?.summary?.startTime) {
      const t = linkedTraceData.trace.summary.startTime;
      return Number(t.seconds) * 1000 + Math.floor(Number(t.nanos) / 1_000_000);
    }
    if (selectedTraceId) {
      const trace = accumulatedTraces.find((t) => t.traceId === selectedTraceId);
      if (trace?.startTime) {
        return Number(trace.startTime.seconds) * 1000 + Math.floor(Number(trace.startTime.nanos) / 1_000_000);
      }
    }
    return null;
  }, [isLinkedTraceMode, linkedTraceData, selectedTraceId, accumulatedTraces]);

  // Calculate histogram time range based on mode
  // In linked mode: trace time ± 1 hour (but end time capped to now)
  // In normal mode: query time range
  const histogramTimestamps = useMemo(() => {
    const ONE_HOUR = 60 * ONE_MINUTE;
    if (isLinkedTraceMode && activeTraceTimeMs) {
      // Cap end time to current time - no point showing future time range
      const endMs = Math.min(activeTraceTimeMs + ONE_HOUR, Date.now());
      return {
        startTimestamp: timestampFromMs(activeTraceTimeMs - ONE_HOUR),
        endTimestamp: timestampFromMs(endMs),
      };
    }
    return {
      startTimestamp: timestamps.startTimestamp,
      endTimestamp: timestamps.endTimestamp,
    };
  }, [isLinkedTraceMode, activeTraceTimeMs, timestamps.startTimestamp, timestamps.endTimestamp]);

  // Separate histogram query
  const { data: histogramData, isLoading: isHistogramLoading } = useGetTraceHistogramQuery({
    filter: {
      startTime: histogramTimestamps.startTimestamp,
      endTime: histogramTimestamps.endTimestamp,
    },
  });

  // Accumulate traces when data changes
  // Note: Don't include currentPageToken in deps - it changes before data arrives,
  // which would cause the effect to re-run with stale data and duplicate traces
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentPageToken is intentionally excluded - see comment above
  useEffect(() => {
    // In linked mode, get trace summary from GetTrace response
    if (isLinkedTraceMode) {
      if (linkedTraceData?.trace?.summary) {
        setAccumulatedTraces([linkedTraceData.trace.summary]);
      }
      return;
    }

    // Normal mode: accumulate from ListTraces response
    if (!data?.traces) {
      return;
    }
    setAccumulatedTraces((prev) => (currentPageToken === '' ? data.traces : [...prev, ...data.traces]));
    setIsLoadingMore(false);
  }, [data, isLinkedTraceMode, linkedTraceData?.trace?.summary]);

  // Detect when URL has a traceId on initial page load - enter linked mode
  // This only runs once on mount. After that, clicking traces does NOT enter linked mode.
  useEffect(() => {
    if (hasCompletedInitialMount.current) {
      // After initial mount, only handle exiting linked mode when URL params are cleared
      if (!selectedTraceId && isLinkedTraceMode) {
        setIsLinkedTraceMode(false);
        linkedTraceIdRef.current = null;
      }
      return;
    }

    // Initial mount - check if page loaded with a traceId in URL
    hasCompletedInitialMount.current = true;
    if (selectedTraceId) {
      // Page loaded with traceId in URL - enter linked mode
      setIsLinkedTraceMode(true);
      linkedTraceIdRef.current = selectedTraceId;
    }
  }, [selectedTraceId, isLinkedTraceMode]);

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
    setUrlState({ traceId, spanId });
  };

  const handleDismissLinkedTrace = () => {
    setIsLinkedTraceMode(false);
    linkedTraceIdRef.current = null;
    setUrlState({ traceId: null, spanId: null, tab: null });
  };

  const handleViewSurrounding = () => {
    // Exit linked mode and center time range on the linked trace's time
    if (activeTraceTimeMs) {
      const THIRTY_MINUTES = 30 * ONE_MINUTE;
      const startMs = activeTraceTimeMs - THIRTY_MINUTES;
      const endMs = activeTraceTimeMs + THIRTY_MINUTES;

      const startDate = new Date(startMs);
      const endDate = new Date(endMs);
      const label = `${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

      // Clear linked mode but keep the trace selected
      setIsLinkedTraceMode(false);
      linkedTraceIdRef.current = null;

      // Jump to the time range centered on the trace
      setJumpedTo({
        startMs,
        endMs,
        label,
      });
      setAccumulatedTraces([]);
      setCurrentPageToken('');
    } else {
      // Fallback: just dismiss
      handleDismissLinkedTrace();
    }
  };

  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);

  const handleCollapseAll = () => {
    // Trigger collapse all by incrementing counter
    setCollapseAllTrigger((prev) => prev + 1);
  };

  // Calculate the actual visible window from accumulated traces
  const visibleWindow = useMemo(() => calculateVisibleWindow(accumulatedTraces), [accumulatedTraces]);

  // Determine if we're viewing the latest traces (first page, no time jump, not linked)
  // This affects how the timeline chart displays the loaded data range
  const isViewingLiveHead = useMemo(
    () => currentPageToken === '' && jumpedTo === null && !isLinkedTraceMode,
    [currentPageToken, jumpedTo, isLinkedTraceMode]
  );

  // Use histogram from separate query
  const displayHistogram = histogramData?.histogram;
  const displayTotalCount = histogramData?.totalCount ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Heading level={1}>Transcripts</Heading>
        <Text variant="muted">Inspect LLM calls, tool invocations, and nested spans from your AI agents</Text>
      </header>

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

      {/* Activity Chart - Show skeleton while loading, then chart if data exists */}
      {isHistogramLoading && <TranscriptActivityChartSkeleton />}
      {!isHistogramLoading && displayHistogram && displayHistogram.buckets.length > 0 && (
        <TranscriptActivityChart
          highlightedTraceTimeMs={activeTraceTimeMs}
          histogram={displayHistogram}
          isViewingLatest={isViewingLiveHead}
          loadedCount={accumulatedTraces.length}
          onBucketClick={jumpedTo || isLinkedTraceMode ? undefined : handleBucketClick}
          queryEndMs={
            isLinkedTraceMode && activeTraceTimeMs
              ? Math.min(activeTraceTimeMs + 60 * 60 * 1000, Date.now())
              : jumpedTo
                ? jumpedTo.endMs
                : timestamps.endMs
          }
          queryStartMs={
            isLinkedTraceMode && activeTraceTimeMs
              ? activeTraceTimeMs - 60 * 60 * 1000
              : jumpedTo
                ? jumpedTo.startMs
                : timestamps.startMs
          }
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

        {/* Linked Trace Banner - shown when viewing a linked trace */}
        {isLinkedTraceMode && selectedTraceId && (
          <LinkedTraceBanner
            onDismiss={handleDismissLinkedTrace}
            onViewSurrounding={handleViewSurrounding}
            traceId={selectedTraceId}
          />
        )}

        {/* Traces Table with external toolbar */}
        <TranscriptsTable
          autoExpandTraceId={isLinkedTraceMode ? selectedTraceId : undefined}
          collapseAllTrigger={collapseAllTrigger}
          columnFilters={columnFilters}
          disableFaceting={disableFaceting}
          error={error}
          hasUnfilteredData={Boolean(displayTraces.length > 0)}
          hideToolbar
          isLoading={isLoading && currentPageToken === ''}
          linkedTraceData={isLinkedTraceMode ? linkedTraceData?.trace : undefined}
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
