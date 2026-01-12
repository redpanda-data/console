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

import { timestampDate, timestampFromMs } from '@bufbuild/protobuf/wkt';
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

import { TraceActivityChart } from './components/trace-activity-chart';
import { type EnhancedTraceSummary, statusOptions, TracesTable } from './components/traces-table';

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

type TraceListPageProps = {
  /**
   * Disable expensive table features (faceting) for testing or performance.
   * When true, getFacetedRowModel and getFacetedUniqueValues are not used.
   * This significantly reduces memory consumption in tests.
   * @default false
   */
  disableFaceting?: boolean;
};

/** State for tracking jumped-to time range */
type JumpedState = {
  startMs: number;
  endMs: number;
  label: string;
} | null;

export const TraceListPage: FC<TraceListPageProps> = ({ disableFaceting = false }) => {
  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Traces';
      uiState.pageBreadcrumbs = [{ title: 'Traces', linkTo: '', heading: 'Traces' }];
    });
  }, []);

  const [selectedTraceId, setSelectedTraceId] = useQueryState('traceId', parseAsString);
  const [selectedSpanId, setSelectedSpanId] = useQueryState('spanId', parseAsString);
  const [timeRange, setTimeRange] = useQueryState('timeRange', parseAsString.withDefault('1h'));
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  // Update nowMs when time range changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally update timestamp when time range changes for relative time calculations
  useEffect(() => {
    setNowMs(Date.now());
    // Reset accumulated traces and jump state when time range changes
    setAccumulatedTraces([]);
    setCurrentPageToken('');
    setJumpedTo(null);
    setInitialHistogram(undefined);
    setInitialTotalCount(0);
    hasInitializedRef.current = false;
  }, [timeRange]);

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
  const { data, isLoading, error, refetch } = useListTracesQuery({
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
  useEffect(() => {
    if (data?.traces) {
      if (currentPageToken === '') {
        // First page - replace accumulated traces
        setAccumulatedTraces(data.traces);
      } else {
        // Subsequent pages - append to accumulated traces
        setAccumulatedTraces((prev) => [...prev, ...data.traces]);
      }
      // Reset loading state when data arrives
      setIsLoadingMore(false);
    }
  }, [data?.traces, currentPageToken]);

  // Connect the global refresh button to this page's refetch function
  useEffect(() => {
    const previousHandler = appGlobal.onRefresh;
    appGlobal.onRefresh = () => {
      // Update the time window to "now" before refetching
      setNowMs(Date.now());
      // Reset state
      setAccumulatedTraces([]);
      setCurrentPageToken('');
      setJumpedTo(null);
      setInitialHistogram(undefined);
      setInitialTotalCount(0);
      hasInitializedRef.current = false;
      refetch();
    };
    return () => {
      // Restore previous handler on unmount
      appGlobal.onRefresh = previousHandler;
    };
  }, [refetch]);

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
      displayTraces.map((trace): EnhancedTraceSummary => {
        let status: EnhancedTraceSummary['status'];
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
  const columns = useMemo<ColumnDef<EnhancedTraceSummary>[]>(
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
  const table = useReactTable<EnhancedTraceSummary>({
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Update the time window to "now" before refetching
      setNowMs(Date.now());
      // Reset state
      setAccumulatedTraces([]);
      setCurrentPageToken('');
      setJumpedTo(null);
      setInitialHistogram(undefined);
      setInitialTotalCount(0);
      hasInitializedRef.current = false;
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
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
    setJumpedTo(null);
    setAccumulatedTraces([]);
    setCurrentPageToken('');
    setNowMs(Date.now());
    hasInitializedRef.current = false;
    setInitialHistogram(undefined);
    setInitialTotalCount(0);
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
  const visibleWindow = useMemo(() => {
    if (accumulatedTraces.length === 0) {
      return { startMs: 0, endMs: 0 };
    }

    // Find oldest and newest trace in accumulated traces
    let oldestMs = Number.POSITIVE_INFINITY;
    let newestMs = Number.NEGATIVE_INFINITY;

    for (const trace of accumulatedTraces) {
      if (trace.startTime) {
        const traceMs = timestampDate(trace.startTime).getTime();
        if (traceMs < oldestMs) {
          oldestMs = traceMs;
        }
        if (traceMs > newestMs) {
          newestMs = traceMs;
        }
      }
    }

    return {
      startMs: oldestMs === Number.POSITIVE_INFINITY ? 0 : oldestMs,
      endMs: newestMs === Number.NEGATIVE_INFINITY ? 0 : newestMs,
    };
  }, [accumulatedTraces]);

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
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          {/* Show "Back to newest" when jumped */}
          {jumpedTo !== null && (
            <Button className="h-8 gap-1.5" onClick={handleBackToNewest} size="sm" variant="outline">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to newest
            </Button>
          )}
          <Input
            className="h-8 w-[300px]"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              table.getColumn('searchable')?.setFilterValue(event.target.value)
            }
            placeholder="Search traces..."
            value={(table.getColumn('searchable')?.getFilterValue() as string) ?? ''}
          />
          {table.getColumn('rootServiceName') && serviceOptions.length > 0 && (
            <DataTableFacetedFilter column={table.getColumn('rootServiceName')} options={serviceOptions} title="Service" />
          )}
          {table.getColumn('status') && (
            <DataTableFacetedFilter column={table.getColumn('status')} options={statusOptions} title="Status" />
          )}
          {isFiltered ? (
            <Button onClick={() => table.resetColumnFilters()} size="sm" variant="ghost">
              Reset
              <X className="ml-2 h-4 w-4" />
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {/* Show jumped-to indicator */}
          {jumpedTo !== null && (
            <span className="rounded bg-muted px-2 py-1 text-muted-foreground text-xs">Viewing: {jumpedTo.label}</span>
          )}
          <Select disabled={!!jumpedTo} onValueChange={setTimeRange} value={timeRange}>
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

          <Button className="h-8 w-8" disabled={isRefreshing} onClick={handleRefresh} size="icon" variant="outline">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Activity Chart - Always show when we have histogram data */}
      {displayHistogram && displayHistogram.buckets.length > 0 && (
        <TraceActivityChart
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
          <div className="flex items-center justify-between px-1 text-muted-foreground text-xs">
            <span>
              {isLoading && currentPageToken === '' ? (
                <span className="flex items-center gap-2">
                  <Spinner size="xs" />
                  Loading traces...
                </span>
              ) : (
                <>
                  Showing {tracesStats.total} {tracesStats.total === 1 ? 'trace' : 'traces'}
                  {(tracesStats.withErrors > 0 || tracesStats.inProgress > 0) && (
                    <span className="text-muted-foreground/70">
                      {' '}
                      ({tracesStats.completed} completed
                      {tracesStats.withErrors > 0 && `, ${tracesStats.withErrors} with errors`}
                      {tracesStats.inProgress > 0 && `, ${tracesStats.inProgress} in-progress`})
                    </span>
                  )}
                </>
              )}
            </span>
            <div className="flex items-center gap-3">
              <Button className="h-6 px-2 text-[10px]" onClick={handleCollapseAll} size="sm" variant="ghost">
                Collapse all
              </Button>
            </div>
          </div>
        )}

        {/* Traces Table with external toolbar */}
        <TracesTable
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
        {data?.nextPageToken && !isLoading && (
          <div className="flex justify-center py-2">
            <Button className="gap-2" disabled={isLoadingMore} onClick={handleLoadMore} size="sm" variant="outline">
              {isLoadingMore ? (
                <>
                  <Spinner size="xs" />
                  Loading...
                </>
              ) : (
                'Load 100 older traces'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
