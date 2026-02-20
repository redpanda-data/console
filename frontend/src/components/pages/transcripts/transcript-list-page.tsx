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
import type { ColumnFiltersState } from '@tanstack/react-table';
import { Button } from 'components/redpanda-ui/components/button';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Heading, Link, Text } from 'components/redpanda-ui/components/typography';
import { runInAction } from 'mobx';
import { parseAsArrayOf, parseAsBoolean, parseAsString, useQueryStates } from 'nuqs';
import {
  type AttributeFilter,
  AttributeOperator,
  type ListTracesRequest_Filter,
  type TraceSummary,
} from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGetTraceHistogramQuery, useGetTraceQuery, useListTracesQuery } from 'react-query/api/tracing';
import { ONE_MINUTE } from 'react-query/react-query.utils';
import { appGlobal } from 'state/app-global';
import { uiState } from 'state/ui-state';
import { pluralize } from 'utils/string';
import { getTimeRanges } from 'utils/time-range';
import { z } from 'zod';

import { LinkedTraceBanner } from './components/linked-trace-banner';
import type { ServiceInfo } from './components/service-filter';
import { TranscriptActivityChart, TranscriptActivityChartSkeleton } from './components/transcript-activity-chart';
import { type SpanFilter, type SpanFilterPreset, TranscriptFilterBar } from './components/transcript-filter-bar';
import { TranscriptsTable } from './components/transcripts-table';
import { calculateVisibleWindow } from './utils/transcript-statistics';

const TIME_RANGES = getTimeRanges(24 * 60 * 60 * 1000); // Up to 24 hours

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

/** State for tracking jumped-to time range */
type JumpedState = {
  startMs: number;
  endMs: number;
  label: string;
} | null;

/** Zod schema for URL attribute filters - provides validation and type safety */
const UrlAttributeFilterSchema = z.object({
  id: z.string(),
  key: z.string(),
  op: z.enum(['equals', 'not_equals']),
  value: z.string(),
});

const UrlAttributeFiltersSchema = z.array(UrlAttributeFilterSchema);

/** URL-serializable attribute filter type (inferred from schema) */
type UrlAttributeFilter = z.infer<typeof UrlAttributeFilterSchema>;

// Slow threshold: 5 seconds in nanoseconds
const SLOW_THRESHOLD_NS = BigInt(5_000_000_000);

/**
 * Encode filters to base64 string for URL storage.
 * Base64 encoding prevents TanStack Router from pre-parsing JSON-like strings.
 */
const encodeAttrFilters = (filters: UrlAttributeFilter[]): string | null => {
  if (filters.length === 0) {
    return null;
  }
  // Use btoa with encodeURIComponent for unicode safety
  return btoa(unescape(encodeURIComponent(JSON.stringify(filters))));
};

/**
 * Decode base64 string to attribute filters with Zod validation.
 * Returns empty array on invalid input.
 */
const decodeAttrFilters = (encoded: string | null): UrlAttributeFilter[] => {
  if (!encoded) {
    return [];
  }
  try {
    // Decode base64, then parse JSON
    const json = decodeURIComponent(escape(atob(encoded)));
    const data = JSON.parse(json);
    const result = UrlAttributeFiltersSchema.safeParse(data);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
};

/**
 * Build API filter from UI state.
 * Converts quick filters (LLM, Tool, Agent, Error, Slow) to API filter fields.
 */
type BuildApiFilterParams = {
  startTimestamp: ReturnType<typeof timestampFromMs>;
  endTimestamp: ReturnType<typeof timestampFromMs>;
  activePresets: SpanFilterPreset[];
  urlAttrFilters: UrlAttributeFilter[];
  serviceNames: string[];
};

const buildApiFilter = ({
  startTimestamp,
  endTimestamp,
  activePresets,
  urlAttrFilters,
  serviceNames,
}: BuildApiFilterParams): ListTracesRequest_Filter => {
  const attributeFilters: AttributeFilter[] = [];

  // LLM filter → attribute filter with IN operator
  if (activePresets.includes('llm')) {
    attributeFilters.push({
      $typeName: 'redpanda.api.dataplane.v1alpha3.AttributeFilter',
      key: 'gen_ai.operation.name',
      operator: AttributeOperator.IN,
      value: '',
      values: ['chat', 'text_completion'],
    });
  }

  // Tool filter → attribute filter
  if (activePresets.includes('tool')) {
    attributeFilters.push({
      $typeName: 'redpanda.api.dataplane.v1alpha3.AttributeFilter',
      key: 'gen_ai.operation.name',
      operator: AttributeOperator.EQUALS,
      value: 'execute_tool',
      values: [],
    });
  }

  // Agent filter → attribute filter
  if (activePresets.includes('agent')) {
    attributeFilters.push({
      $typeName: 'redpanda.api.dataplane.v1alpha3.AttributeFilter',
      key: 'gen_ai.operation.name',
      operator: AttributeOperator.EQUALS,
      value: 'invoke_agent',
      values: [],
    });
  }

  // Add user-defined attribute filters
  for (const f of urlAttrFilters) {
    attributeFilters.push({
      $typeName: 'redpanda.api.dataplane.v1alpha3.AttributeFilter',
      key: f.key,
      operator: f.op === 'equals' ? AttributeOperator.EQUALS : AttributeOperator.NOT_EQUALS,
      value: f.value,
      values: [],
    });
  }

  return {
    $typeName: 'redpanda.api.dataplane.v1alpha3.ListTracesRequest.Filter',
    startTime: startTimestamp,
    endTime: endTimestamp,
    attributeFilters,
    // Error and Slow use dedicated fields (not attribute filters)
    hasErrors: activePresets.includes('error') ? true : undefined,
    minDurationNs: activePresets.includes('slow') ? SLOW_THRESHOLD_NS : undefined,
    // Service name filter - uses dedicated field for OR logic
    serviceNames: serviceNames.length > 0 ? serviceNames : [],
    // Span ID filter - not exposed in UI yet, but required by proto
    spanIds: [],
  };
};

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
  // Note: attrFilters is stored as a JSON string to avoid nuqs/TanStack Router adapter issues
  const [urlState, setUrlState] = useQueryStates({
    traceId: parseAsString,
    spanId: parseAsString,
    tab: parseAsString,
    timeRange: parseAsString.withDefault('1h'),
    // Filter state
    presets: parseAsArrayOf(parseAsString).withDefault([]),
    attrFilters: parseAsString, // JSON string, parsed manually
    fullTraces: parseAsBoolean.withDefault(true),
    services: parseAsArrayOf(parseAsString).withDefault([]), // Service name filter
  });
  const {
    traceId: selectedTraceId,
    spanId: selectedSpanId,
    timeRange,
    presets: activePresets,
    attrFilters: attrFiltersJson,
    fullTraces: showFullTraces,
    services: selectedServices,
  } = urlState;

  // Decode the base64-encoded filters from URL
  const urlAttrFilters = useMemo(() => decodeAttrFilters(attrFiltersJson), [attrFiltersJson]);

  // Wrapper setters for components that need individual setters
  const setSelectedTraceId = useCallback((value: string | null) => setUrlState({ traceId: value }), [setUrlState]);
  const setSelectedSpanId = useCallback((value: string | null) => setUrlState({ spanId: value }), [setUrlState]);

  // Filter state callbacks
  const handlePresetsChange = useCallback(
    (presets: string[]) => setUrlState({ presets: presets as SpanFilterPreset[] }),
    [setUrlState]
  );
  const handleShowFullTracesChange = useCallback((show: boolean) => setUrlState({ fullTraces: show }), [setUrlState]);
  const handleSelectedServicesChange = useCallback((services: string[]) => setUrlState({ services }), [setUrlState]);

  // Convert URL attribute filters to SpanFilter format for the filter bar
  const attributeFilters: SpanFilter[] = useMemo(() => {
    const getOpLabel = (op: 'equals' | 'not_equals'): string => {
      const labels: Record<'equals' | 'not_equals', string> = {
        equals: '=',
        not_equals: '!=',
      };
      return labels[op];
    };

    return urlAttrFilters.map((f) => ({
      id: f.id,
      type: 'attribute' as const,
      label: `${f.key} ${getOpLabel(f.op)} ${f.value}`,
      attributeKey: f.key,
      operator: f.op,
      value: f.value,
    }));
  }, [urlAttrFilters]);

  const handleAttributeFiltersChange = useCallback(
    (filters: SpanFilter[]) => {
      const urlFilters: UrlAttributeFilter[] = filters
        .filter(
          (
            f
          ): f is SpanFilter & { attributeKey: string; operator: NonNullable<SpanFilter['operator']>; value: string } =>
            f.type === 'attribute' && !!f.attributeKey && !!f.operator && !!f.value
        )
        .map((f) => ({
          id: f.id,
          key: f.attributeKey,
          op: f.operator,
          value: f.value,
        }));
      // Encode to base64 to prevent TanStack Router from pre-parsing JSON
      setUrlState({ attrFilters: encodeAttrFilters(urlFilters) });
    },
    [setUrlState]
  );

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

  // Build API filter from UI state - used for both list and histogram queries
  const apiFilter = useMemo(
    () =>
      buildApiFilter({
        startTimestamp: timestamps.startTimestamp,
        endTimestamp: timestamps.endTimestamp,
        activePresets: (activePresets || []) as SpanFilterPreset[],
        urlAttrFilters,
        serviceNames: selectedServices || [],
      }),
    [timestamps.startTimestamp, timestamps.endTimestamp, activePresets, urlAttrFilters, selectedServices]
  );

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
      filter: apiFilter,
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

  // Build histogram filter (same filters but potentially different time range for linked mode)
  const histogramFilter = useMemo(
    () =>
      buildApiFilter({
        startTimestamp: histogramTimestamps.startTimestamp,
        endTimestamp: histogramTimestamps.endTimestamp,
        activePresets: (activePresets || []) as SpanFilterPreset[],
        urlAttrFilters,
        serviceNames: selectedServices || [],
      }),
    [
      histogramTimestamps.startTimestamp,
      histogramTimestamps.endTimestamp,
      activePresets,
      urlAttrFilters,
      selectedServices,
    ]
  );

  // Separate histogram query - uses same filters as list query for consistency
  const { data: histogramData, isLoading: isHistogramLoading } = useGetTraceHistogramQuery({
    filter: histogramFilter,
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

  // Track previous filter state to detect changes
  const prevFiltersRef = useRef<{ presets: string; attrs: string; services: string }>({
    presets: JSON.stringify(activePresets || []),
    attrs: JSON.stringify(urlAttrFilters),
    services: JSON.stringify(selectedServices || []),
  });

  // Clear span selection when filters change
  // This prevents the details panel from showing an orphaned span that doesn't match current filters
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedSpanId intentionally excluded - we only want to react to filter changes, not selection changes
  useEffect(() => {
    const currentPresets = JSON.stringify(activePresets || []);
    const currentAttrs = JSON.stringify(urlAttrFilters);
    const currentServices = JSON.stringify(selectedServices || []);
    const prev = prevFiltersRef.current;

    const filtersChanged =
      prev.presets !== currentPresets || prev.attrs !== currentAttrs || prev.services !== currentServices;

    // Update ref for next comparison
    prevFiltersRef.current = { presets: currentPresets, attrs: currentAttrs, services: currentServices };

    // Clear selection when filters change - the selected span may no longer match
    if (selectedSpanId && filtersChanged) {
      setUrlState({ traceId: null, spanId: null, tab: null });
    }
  }, [activePresets, urlAttrFilters, selectedServices, setUrlState]);

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

  // Extract distinct services from loaded traces for the service filter dropdown
  // Only includes traces with actual service names (skips unknown/empty)
  const distinctServices: ServiceInfo[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trace of displayTraces) {
      // Skip traces without a service name (orphan traces awaiting root span)
      const serviceName = trace.rootServiceName;
      if (!serviceName) {
        continue;
      }
      counts.set(serviceName, (counts.get(serviceName) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name, // Display name
        value: name, // Actual value to send to API (same as name)
        count,
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending
  }, [displayTraces]);

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

  // Pre-compute chart query times to avoid nested ternaries in JSX
  const chartQueryEndMs =
    isLinkedTraceMode && activeTraceTimeMs
      ? Math.min(activeTraceTimeMs + 60 * 60 * 1000, Date.now())
      : (jumpedTo?.endMs ?? timestamps.endMs);
  const chartQueryStartMs =
    isLinkedTraceMode && activeTraceTimeMs
      ? activeTraceTimeMs - 60 * 60 * 1000
      : (jumpedTo?.startMs ?? timestamps.startMs);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Heading level={1}>Transcripts</Heading>
        <Text variant="muted">
          Trace and debug AI requests across your agentic dataplane — view LLM calls, tool invocations, and spans from
          agents, gateways, and services.{' '}
          <Link href="https://docs.redpanda.com/redpanda-cloud/ai-agents/observability" target="_blank">
            Learn more
          </Link>
        </Text>
      </header>

      {/* Toolbar with Span Filters, Time Range, and Controls */}
      <TranscriptFilterBar
        activePresets={(activePresets || []) as SpanFilterPreset[]}
        attributeFilters={attributeFilters}
        isLoading={isLoading}
        jumpedTo={jumpedTo}
        onAttributeFiltersChange={handleAttributeFiltersChange}
        onBackToNewest={handleBackToNewest}
        onPresetsChange={handlePresetsChange}
        onRefresh={handleRefresh}
        onSelectedServicesChange={handleSelectedServicesChange}
        onShowFullTracesChange={handleShowFullTracesChange}
        onTimeRangeChange={handleTimeRangeChange}
        selectedServices={selectedServices || []}
        services={distinctServices}
        showFullTraces={showFullTraces ?? true}
        timeRange={timeRange}
      />

      {/* Activity Chart - Show skeleton while loading, then chart if data exists */}
      {isHistogramLoading ? <TranscriptActivityChartSkeleton /> : null}
      {!isHistogramLoading && displayHistogram && displayHistogram.buckets.length > 0 && (
        <TranscriptActivityChart
          highlightedTraceTimeMs={activeTraceTimeMs}
          histogram={displayHistogram}
          isViewingLatest={isViewingLiveHead}
          loadedCount={accumulatedTraces.length}
          onBucketClick={jumpedTo || isLinkedTraceMode ? undefined : handleBucketClick}
          queryEndMs={chartQueryEndMs}
          queryStartMs={chartQueryStartMs}
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
        {isLinkedTraceMode && selectedTraceId ? (
          <LinkedTraceBanner
            onDismiss={handleDismissLinkedTrace}
            onViewSurrounding={handleViewSurrounding}
            traceId={selectedTraceId}
          />
        ) : null}

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
          matchedSpans={data?.matchedSpans}
          onSpanClick={handleSpanClick}
          selectedSpanId={selectedSpanId}
          selectedTraceId={selectedTraceId}
          setColumnFilters={setColumnFilters}
          setSelectedSpanId={setSelectedSpanId}
          setSelectedTraceId={setSelectedTraceId}
          showFullTraces={showFullTraces ?? true}
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
