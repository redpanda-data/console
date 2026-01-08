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
import { Database, RefreshCw, X } from 'lucide-react';
import { runInAction } from 'mobx';
import { parseAsString, useQueryState } from 'nuqs';
import type { ChangeEvent, FC } from 'react';
import { useEffect, useMemo, useState } from 'react';
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

export const TraceListPage: FC = () => {
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

  const selectedRange = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[3];

  // Update nowMs when time range changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally update timestamp when time range changes for relative time calculations
  useEffect(() => {
    setNowMs(Date.now());
  }, [timeRange]);

  const timestamps = useMemo(() => {
    const startMs = nowMs - selectedRange.ms;

    return {
      startTimestamp: timestampFromMs(startMs),
      endTimestamp: timestampFromMs(nowMs),
    };
  }, [nowMs, selectedRange.ms]);

  const { data, isLoading, error, refetch } = useListTracesQuery({
    startTime: timestamps.startTimestamp,
    endTime: timestamps.endTimestamp,
    pageSize: 500,
  });

  // Connect the global refresh button to this page's refetch function
  useEffect(() => {
    const previousHandler = appGlobal.onRefresh;
    appGlobal.onRefresh = () => {
      // Update the time window to "now" before refetching
      setNowMs(Date.now());
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

  const tracesStats = useMemo(() => {
    const traces = data?.traces || [];
    const completed = traces.filter((t) => t.errorCount === 0 && t.spanCount > 0).length;
    const inProgress = traces.filter((t) => t.spanCount === 0).length;
    const withErrors = traces.filter((t) => t.errorCount > 0).length;
    return { completed, inProgress, withErrors, total: traces.length };
  }, [data?.traces]);

  // Enhance traces with searchable field and status for filtering
  const enhancedTraces = useMemo(
    () =>
      (data?.traces || []).map((trace): EnhancedTraceSummary => {
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
          searchable: `${trace.traceId} ${trace.rootSpanName} ${trace.serviceName}`,
          status,
        };
      }),
    [data?.traces]
  );

  // Create table instance for toolbar filters
  const table = useReactTable<EnhancedTraceSummary>({
    data: enhancedTraces,
    columns: [
      {
        accessorKey: 'searchable',
        filterFn: 'includesString',
      },
      {
        accessorKey: 'serviceName',
        filterFn: (row, id, value) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: 'status',
        filterFn: (row, id, value) => value.includes(row.getValue(id)),
      },
    ] as ColumnDef<EnhancedTraceSummary>[],
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    state: {
      columnFilters,
    },
  });

  // Generate service name options from ALL traces (not filtered)
  const serviceOptions = useMemo(() => {
    const uniqueServices = new Set<string>();
    for (const trace of data?.traces || []) {
      if (trace.serviceName) {
        uniqueServices.add(trace.serviceName);
      }
    }
    return Array.from(uniqueServices)
      .sort()
      .map((serviceName) => ({
        value: serviceName,
        label: serviceName,
        icon: Database,
      }));
  }, [data?.traces]);

  const isFiltered = columnFilters.length > 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Update the time window to "now" before refetching
      setNowMs(Date.now());
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
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
          <Input
            className="h-8 w-[300px]"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              table.getColumn('searchable')?.setFilterValue(event.target.value)
            }
            placeholder="Search traces..."
            value={(table.getColumn('searchable')?.getFilterValue() as string) ?? ''}
          />
          {table.getColumn('serviceName') && serviceOptions.length > 0 && (
            <DataTableFacetedFilter column={table.getColumn('serviceName')} options={serviceOptions} title="Service" />
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
          <Select onValueChange={setTimeRange} value={timeRange}>
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

      {/* Activity Chart - Compact (only show when we have data) */}
      {data?.traces && data.traces.length > 0 && (
        <TraceActivityChart timeRangeMs={selectedRange.ms} traces={data.traces} />
      )}

      {/* Stats row and table grouped together with minimal gap */}
      <div className="flex flex-col gap-2">
        {/* Traces Summary (only show when we have data) */}
        {data?.traces && data.traces.length > 0 && (
          <div className="flex items-center justify-between px-1 text-muted-foreground text-xs">
            <span>
              {isLoading ? (
                'Loading traces...'
              ) : (
                <>
                  Showing {tracesStats.completed} completed {tracesStats.completed === 1 ? 'trace' : 'traces'}
                  {tracesStats.inProgress > 0 && ` and ${tracesStats.inProgress} in-progress`}
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
          error={error}
          hasUnfilteredData={Boolean(data?.traces && data.traces.length > 0)}
          hideToolbar
          isLoading={isLoading}
          onSpanClick={handleSpanClick}
          selectedSpanId={selectedSpanId}
          selectedTraceId={selectedTraceId}
          setColumnFilters={setColumnFilters}
          setSelectedSpanId={setSelectedSpanId}
          setSelectedTraceId={setSelectedTraceId}
          timeRange={selectedRange.label}
          traces={data?.traces || []}
        />
      </div>
    </div>
  );
};
