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

import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  type Table as TanstackTable,
  useReactTable,
} from '@tanstack/react-table';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTableFacetedFilter } from 'components/redpanda-ui/components/data-table';
import { Input } from 'components/redpanda-ui/components/input';
import { ScrollArea } from 'components/redpanda-ui/components/scroll-area';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  Inbox,
  Loader2,
  X,
} from 'lucide-react';
import type { TraceSummary } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { ChangeEvent, FC } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useGetTraceQuery } from 'react-query/api/tracing';

import { TraceDetailsSheet } from './trace-details-sheet';
import { getIconForServiceName, getServiceName } from '../utils/span-classifier';
import {
  buildSpanTree,
  calculateOffset,
  calculateTimeline,
  calculateWidth,
  type SpanNode,
} from '../utils/span-tree-builder';
import { formatDuration } from '../utils/trace-formatters';
import { isIncompleteTrace } from '../utils/trace-statistics';

// Trace status type for type safety
export type TraceStatus = 'completed' | 'in-progress' | 'with-errors';

// Enhanced trace summary with computed fields
export type EnhancedTraceSummary = TraceSummary & {
  searchable: string;
  status: TraceStatus;
};

// Status filter options for traces
export const statusOptions = [
  { value: 'completed' as const, label: 'Completed', icon: Check },
  { value: 'in-progress' as const, label: 'In Progress', icon: Loader2 },
  { value: 'with-errors' as const, label: 'With Errors', icon: AlertCircle },
];

// Custom toolbar for traces
export function TracesDataTableToolbar({
  table,
  traces,
}: {
  table: TanstackTable<EnhancedTraceSummary>;
  traces: TraceSummary[];
}) {
  const isFiltered = table.getState().columnFilters.length > 0;

  // Generate service name options from ALL traces (not filtered)
  const serviceOptions = useMemo(() => {
    const uniqueServices = new Set<string>();
    for (const trace of traces) {
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
  }, [traces]);

  const serviceColumn = table.getColumn('serviceName');

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-2">
        <Input
          className="h-8 w-[150px]"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            table.getColumn('searchable')?.setFilterValue(event.target.value)
          }
          placeholder="Search traces..."
          value={(table.getColumn('searchable')?.getFilterValue() as string) ?? ''}
        />
        {serviceColumn && serviceOptions.length > 0 && (
          <DataTableFacetedFilter column={serviceColumn} options={serviceOptions} title="Service" />
        )}
        {table.getColumn('status') && (
          <DataTableFacetedFilter column={table.getColumn('status')} options={statusOptions} title="Status" />
        )}
        {isFiltered && (
          <Button onClick={() => table.resetColumnFilters()} size="sm" variant="ghost">
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface Props {
  traces: TraceSummary[];
  isLoading: boolean;
  error?: Error | null;
  hasUnfilteredData: boolean;
  timeRange: string;
  onSpanClick: (traceId: string, spanId: string) => void;
  selectedTraceId: string | null | undefined;
  selectedSpanId: string | null | undefined;
  setSelectedTraceId: (traceId: string | null) => void;
  setSelectedSpanId: (spanId: string | null) => void;
  collapseAllTrigger: number;
  columnFilters: ColumnFiltersState;
  setColumnFilters: (filters: ColumnFiltersState) => void;
  hideToolbar?: boolean;
}

// Format timestamp
const formatTime = (timestamp: Date): string =>
  timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

// Span Row Component with tree lines
interface SpanRowProps {
  span: SpanNode;
  depth: number;
  timeline: ReturnType<typeof calculateTimeline>;
  baseTimestamp: Date;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onClick: (traceId: string, spanId: string) => void;
  traceId: string;
  isLastChild: boolean;
  parentDepths: number[];
  expandedSpans?: Set<string>;
  toggleSpan?: (spanId: string) => void;
}

const SpanRow: FC<SpanRowProps> = ({
  span,
  depth,
  timeline,
  baseTimestamp,
  isExpanded,
  hasChildren,
  onToggle,
  onClick,
  traceId,
  isLastChild,
  parentDepths,
  expandedSpans,
  toggleSpan,
}) => {
  // Calculate relative position within trace using helper functions
  const barStart = calculateOffset(span.startTime, timeline);
  const barWidth = calculateWidth(span.duration, timeline);

  // Calculate span timestamp
  const startOffsetMs = Number((span.startTime - timeline.minTime) / 1_000_000n);
  const spanTimestamp = new Date(baseTimestamp.getTime() + startOffsetMs);

  const Icon = getIconForServiceName(span.span);
  const serviceName = getServiceName(span.span);

  // parentDepths is a set of "gutter column indices" (0-based) that should show a full-height
  // continuation vertical line for THIS row.
  //
  // column 0: the w-5 gutter (left-[9px])
  // columns 1..N: the w-6 gutters (left-[11px]) for deeper nesting

  // True when this row should draw the column-0 continuation line (to connect from the root trace row),
  // or when this row is depth-1 (so we draw the root-level connector "into" the row).
  const drawCol0Vertical = parentDepths.includes(0) || depth === 1;

  // For depth-1 rows, the vertical in column 0 should stop at midline if this node is last among siblings.
  // Otherwise, extend slightly past the row border to hide seams.
  const col0VerticalHeight = isLastChild && depth === 1 ? '50%' : 'calc(100% + 1px)';

  return (
    <>
      <button
        className={cn(
          'flex h-8 w-full cursor-pointer items-center border-border/30 border-b text-left transition-colors hover:bg-muted/50'
        )}
        onClick={() => onClick(traceId, span.spanId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(traceId, span.spanId);
          }
        }}
        tabIndex={0}
        type="button"
      >
        {/* Timestamp */}
        <div className="w-[72px] shrink-0 px-2 py-1">
          <span className="font-mono text-[10px] text-muted-foreground">{formatTime(spanTimestamp)}</span>
        </div>

        {/* Span Info with Tree Lines */}
        <div className="flex min-w-[280px] flex-1 items-center gap-1 px-1 py-1">
          {/* Tree structure lines */}
          {depth > 0 && (
            <div className="flex h-8 shrink-0 items-stretch">
              {/* First column (gutter column 0) - matches root row's w-5 container where the chevron lives */}
              <div
                className="relative flex w-5 items-center justify-center"
                style={{ '--tree-x': '9px' } as React.CSSProperties}
              >
                {/* Continuation vertical (only when needed) */}
                {drawCol0Vertical && (
                  <div
                    className="absolute top-0 w-px bg-border"
                    style={{ left: 'var(--tree-x)', height: col0VerticalHeight }}
                  />
                )}

                {/* Horizontal connector at depth 1 */}
                {depth === 1 && (
                  <div className="absolute top-1/2 h-px w-[11px] bg-border" style={{ left: 'var(--tree-x)' }} />
                )}
              </div>

              {/* Additional gutter columns (1..depth-1) */}
              {Array.from({ length: Math.max(0, depth - 1) }).map((_, i) => {
                // i=0 -> gutter column 1, i=1 -> gutter column 2, ...
                const colIndex = i + 1;
                const isCurrentColumn = colIndex === depth - 1;
                const drawAncestorContinuation = parentDepths.includes(colIndex);

                return (
                  <div
                    className="relative flex w-6 items-center justify-center"
                    key={colIndex}
                    style={{ '--tree-x': '11px' } as React.CSSProperties}
                  >
                    {/* Full-height continuation for ancestor columns */}
                    {drawAncestorContinuation && (
                      <div className="absolute top-0 bottom-0 w-px bg-border" style={{ left: 'var(--tree-x)' }} />
                    )}

                    {/* Current node column: vertical (full or half) + horizontal connector */}
                    {isCurrentColumn && (
                      <>
                        <div
                          className="absolute top-0 w-px bg-border"
                          style={{ left: 'var(--tree-x)', height: isLastChild ? '50%' : 'calc(100% + 1px)' }}
                        />
                        <div className="absolute top-1/2 h-px w-[13px] bg-border" style={{ left: 'var(--tree-x)' }} />
                      </>
                    )}
                  </div>
                );
              })}

              {/* Chevron button as final tree column with vertical line connector */}
              <div
                className="relative flex h-8 w-6 shrink-0 items-center"
                style={{ '--tree-x': '11px' } as React.CSSProperties}
              >
                {/* Vertical line connecting to chevron when expanded and has children */}
                {isExpanded && hasChildren && (
                  <div className="absolute top-1/2 bottom-0 w-px bg-border" style={{ left: 'var(--tree-x)' }} />
                )}
                <Button
                  className={cn('absolute z-10 h-4 w-4 shrink-0 -translate-x-1/2', !hasChildren && 'invisible')}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                  size="icon"
                  style={{ left: 'var(--tree-x)' }}
                  variant="ghost"
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          )}

          {/* Spacer for content indentation */}
          <div className="w-1 shrink-0" />

          {/* Service badge */}
          <Badge
            className="flex h-4 shrink-0 items-center border-border bg-muted/50 px-1.5 py-0 font-normal text-[10px] text-muted-foreground"
            variant="outline"
          >
            <Icon className="mr-1 h-3 w-3" />
            {serviceName}
          </Badge>

          {/* Children count */}
          {hasChildren && (
            <Badge
              className="h-4 shrink-0 border-border bg-muted/50 px-1 py-0 font-mono text-[10px] text-muted-foreground"
              variant="outline"
            >
              {span.children?.length || 0}
            </Badge>
          )}

          {/* Span name */}
          <span className="ml-1 truncate text-[11px]" title={span.name}>
            {span.name}
          </span>

          {/* Error badge */}
          {span.hasError && (
            <Badge className="shrink-0 text-xs" variant="destructive">
              Error
            </Badge>
          )}
        </div>

        {/* Duration Bar */}
        <div className="flex w-[260px] shrink-0 items-center gap-2 py-1 pr-6 pl-2">
          <div className="relative h-2.5 flex-1 rounded-sm bg-muted/30">
            <div
              className={cn('absolute h-full rounded-sm', span.hasError ? 'bg-red-500/70' : 'bg-sky-500/70')}
              style={{
                left: `${barStart}%`,
                width: `${barWidth}%`,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-left font-mono text-[10px] text-muted-foreground">
            {formatDuration(span.duration)}
          </span>
        </div>
      </button>

      {/* Render children */}
      {isExpanded &&
        expandedSpans &&
        toggleSpan &&
        (() => {
          // The gutter column index for THIS node is (depth - 1).
          // If THIS node has more siblings after it (i.e. !isLastChild), we want a continuation vertical
          // in that column for all rows in the subtree.
          const parentColumnIndex = depth - 1;

          let nextParentDepths: number[];
          if (isLastChild) {
            nextParentDepths = parentDepths.filter((d) => d !== parentColumnIndex);
          } else if (parentDepths.includes(parentColumnIndex)) {
            nextParentDepths = parentDepths;
          } else {
            nextParentDepths = [...parentDepths, parentColumnIndex];
          }

          return span.children?.map((child, index) => (
            <SpanRowWrapper
              baseTimestamp={baseTimestamp}
              depth={depth + 1}
              expandedSpans={expandedSpans}
              isExpanded={expandedSpans.has(child.spanId)}
              isLastChild={index === span.children.length - 1}
              key={child.spanId}
              onClick={onClick}
              onToggle={() => toggleSpan(child.spanId)}
              parentDepths={nextParentDepths}
              span={child}
              timeline={timeline}
              toggleSpan={toggleSpan}
              traceId={traceId}
            />
          ));
        })()}
    </>
  );
};

// Span Row Wrapper - now uses controlled state from parent
const SpanRowWrapper: FC<{
  span: SpanNode;
  depth: number;
  timeline: ReturnType<typeof calculateTimeline>;
  baseTimestamp: Date;
  onClick: (traceId: string, spanId: string) => void;
  traceId: string;
  isLastChild: boolean;
  parentDepths: number[];
  isExpanded: boolean;
  onToggle: () => void;
  expandedSpans: Set<string>;
  toggleSpan: (spanId: string) => void;
}> = ({
  span,
  depth,
  timeline,
  baseTimestamp,
  onClick,
  traceId,
  isLastChild,
  parentDepths,
  isExpanded,
  onToggle,
  expandedSpans,
  toggleSpan,
}) => {
  const hasChildren = span.children && span.children.length > 0;

  return (
    <SpanRow
      baseTimestamp={baseTimestamp}
      depth={depth}
      expandedSpans={expandedSpans}
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      isLastChild={isLastChild}
      onClick={onClick}
      onToggle={onToggle}
      parentDepths={parentDepths}
      span={span}
      timeline={timeline}
      toggleSpan={toggleSpan}
      traceId={traceId}
    />
  );
};

// Trace Group Component
const TraceGroup: FC<{
  traceSummary: TraceSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onSpanClick: (traceId: string, spanId: string) => void;
  collapseAllTrigger: number;
}> = ({ traceSummary, isExpanded, onToggle, onSpanClick, collapseAllTrigger }) => {
  const { data: traceData, isLoading, error } = useGetTraceQuery(traceSummary.traceId, { enabled: isExpanded });

  const trace = traceData?.trace;

  const spanTree = useMemo(() => {
    if (!trace?.spans || trace.spans.length === 0) {
      return [];
    }
    return buildSpanTree(trace.spans as Span[]);
  }, [trace?.spans]);

  const timeline = useMemo(() => {
    if (spanTree.length === 0) {
      return { minTime: BigInt(0), maxTime: BigInt(0), duration: 0 };
    }
    return calculateTimeline(spanTree);
  }, [spanTree]);

  // Span expansion state (using Set for simpler expanded/collapsed tracking)
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

  // Initialize span expansion state (depth <= 2 are expanded by default)
  const initializeExpandedSpans = useMemo(() => {
    const set = new Set<string>();
    const initSpan = (span: SpanNode, depth: number) => {
      if (depth <= 2) {
        set.add(span.spanId);
      }
      if (span.children) {
        for (const child of span.children) {
          initSpan(child, depth + 1);
        }
      }
    };
    for (const root of spanTree) {
      initSpan(root, 1);
    }
    return set;
  }, [spanTree]);

  // Initialize expanded state when span tree changes
  useEffect(() => {
    if (spanTree.length > 0) {
      setExpandedSpans(initializeExpandedSpans);
    }
  }, [spanTree, initializeExpandedSpans]);

  // Reset span expansion when collapse all is triggered
  useEffect(() => {
    if (collapseAllTrigger > 0 && spanTree.length > 0) {
      setExpandedSpans(initializeExpandedSpans);
    }
  }, [collapseAllTrigger, spanTree.length, initializeExpandedSpans]);

  const toggleSpan = (spanId: string) => {
    setExpandedSpans((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(spanId)) {
        newSet.delete(spanId);
      } else {
        newSet.add(spanId);
      }
      return newSet;
    });
  };

  const baseTimestamp = traceSummary.startTime ? new Date(Number(traceSummary.startTime.seconds) * 1000) : new Date();

  // Check if trace is incomplete (root span not yet received)
  const isIncomplete = isIncompleteTrace(traceSummary.rootSpanName);

  return (
    <>
      {/* Root trace row */}
      <button
        className={cn(
          'flex h-9 w-full cursor-pointer items-center border-border/40 border-b bg-muted/10 text-left transition-colors hover:bg-muted/30',
          isIncomplete && 'bg-amber-500/5 hover:bg-amber-500/10'
        )}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        type="button"
      >
        {/* Timestamp */}
        <div className="w-[72px] shrink-0 px-2 py-1.5">
          <span className="font-mono text-[10px] text-muted-foreground">{formatTime(baseTimestamp)}</span>
        </div>

        {/* Message column */}
        <div className="flex min-w-[280px] flex-1 items-center gap-1 px-1 py-1.5">
          {/* Expand button with vertical line container */}
          <div
            className="relative flex h-8 w-5 shrink-0 items-center"
            style={{ '--tree-x': '9px' } as React.CSSProperties}
          >
            {/* Vertical line when expanded */}
            {isExpanded && spanTree.length > 0 && (
              <div className="absolute top-1/2 bottom-0 w-px bg-border" style={{ left: 'var(--tree-x)' }} />
            )}
            <Button
              className="absolute z-10 h-4 w-4 shrink-0 -translate-x-1/2"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              size="icon"
              style={{ left: 'var(--tree-x)' }}
              variant="ghost"
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          </div>

          {/* Service badge or incomplete badge */}
          {isIncomplete ? (
            <Badge
              className="flex h-4 shrink-0 items-center border-amber-500/30 bg-amber-500/10 px-1.5 py-0 font-normal text-[10px] text-amber-600"
              variant="outline"
            >
              <AlertCircle className="mr-1 h-3 w-3" />
              awaiting root
            </Badge>
          ) : (
            <Badge
              className="flex h-4 shrink-0 items-center border-border bg-muted/50 px-1.5 py-0 font-normal text-[10px] text-muted-foreground"
              variant="outline"
            >
              <Cpu className="mr-1 h-3 w-3" />
              {traceSummary.serviceName || 'service'}
            </Badge>
          )}

          {/* Span count */}
          <Badge
            className="h-4 shrink-0 border-border bg-muted/50 px-1 py-0 font-mono text-[10px] text-muted-foreground"
            variant="outline"
          >
            {traceSummary.spanCount}
          </Badge>

          {/* Trace name */}
          <span
            className={cn('ml-1 truncate text-[11px]', isIncomplete && 'text-muted-foreground italic')}
            title={traceSummary.rootSpanName}
          >
            {isIncomplete
              ? `${traceSummary.serviceName || 'unknown'} — waiting for parent span`
              : traceSummary.rootSpanName}
          </span>

          {/* Error badge */}
          {traceSummary.errorCount > 0 && (
            <Badge className="shrink-0 text-xs" variant="destructive">
              Error
            </Badge>
          )}
        </div>

        {/* Duration column */}
        <div className="flex w-[260px] shrink-0 items-center gap-2 py-1.5 pr-6 pl-2">
          {isIncomplete ? (
            <>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-full rounded-full bg-amber-500/30" />
              </div>
              <span className="w-14 shrink-0 text-left font-mono text-[10px] text-muted-foreground">—</span>
            </>
          ) : (
            <>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-muted/30">
                <div
                  className={cn('h-full rounded-sm', traceSummary.errorCount > 0 ? 'bg-red-500/70' : 'bg-sky-500/70')}
                  style={{ width: '100%' }}
                />
              </div>
              <span className="w-14 shrink-0 text-left font-mono text-[10px] text-muted-foreground">
                {formatDuration(Number(traceSummary.durationMs))}
              </span>
            </>
          )}
        </div>
      </button>

      {/* Expanded spans */}
      {isExpanded && (
        <>
          {isLoading && <div className="p-4 text-center text-muted-foreground text-sm">Loading spans...</div>}
          {error && (
            <div className="flex items-center justify-center gap-2 p-4 text-center text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>Failed to load trace: {error.message}</span>
            </div>
          )}
          {!(isLoading || error) && spanTree.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">No spans found</div>
          )}
          {!(isLoading || error) &&
            spanTree.length > 0 &&
            spanTree.map((span, index) => (
              <SpanRowWrapper
                baseTimestamp={baseTimestamp}
                depth={1}
                expandedSpans={expandedSpans}
                isExpanded={expandedSpans.has(span.spanId)}
                isLastChild={index === spanTree.length - 1}
                key={span.spanId}
                onClick={onSpanClick}
                onToggle={() => toggleSpan(span.spanId)}
                parentDepths={[0]}
                span={span}
                timeline={timeline}
                toggleSpan={toggleSpan}
                traceId={traceSummary.traceId}
              />
            ))}
        </>
      )}
    </>
  );
};

// Group traces by date
const groupTracesByDate = (traces: TraceSummary[]) => {
  const grouped = new Map<string, { label: string; traces: TraceSummary[] }>();

  for (const trace of traces) {
    if (!trace.startTime) {
      continue;
    }

    const date = new Date(Number(trace.startTime.seconds) * 1000);
    const dateKey = date.toISOString().split('T')[0];
    const dateLabel = date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, { label: dateLabel, traces: [] });
    }
    grouped.get(dateKey)?.traces.push(trace);
  }

  return Array.from(grouped.entries());
};

export const TracesTable: FC<Props> = ({
  traces,
  isLoading,
  error,
  hasUnfilteredData,
  timeRange,
  onSpanClick,
  selectedTraceId,
  selectedSpanId,
  setSelectedTraceId,
  setSelectedSpanId,
  collapseAllTrigger,
  columnFilters,
  setColumnFilters,
  hideToolbar = false,
}) => {
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'newest-first' | 'oldest-first'>('newest-first');

  // Enhance traces with searchable field and status
  const enhancedTraces = useMemo(
    () =>
      traces.map((trace): EnhancedTraceSummary => {
        let status: TraceStatus;
        if (trace.errorCount > 0) {
          status = 'with-errors';
        } else if (trace.spanCount === 0) {
          status = 'in-progress';
        } else {
          status = 'completed';
        }

        return {
          ...trace,
          // Searchable field combining traceId, rootSpanName, and serviceName
          searchable: `${trace.traceId} ${trace.rootSpanName} ${trace.serviceName}`,
          // Status field for filtering
          status,
        };
      }),
    [traces]
  );

  // TanStack Table setup
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
    onColumnFiltersChange: (updaterOrValue) => {
      const newFilters = typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;
      setColumnFilters(newFilters);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    state: {
      columnFilters,
    },
  });

  const filteredTraces = table.getRowModel().rows.map((row) => row.original);

  // Sort filtered traces by timestamp based on sortOrder
  const sortedTraces = useMemo(() => {
    const sorted = [...filteredTraces].sort((a, b) => {
      const aTime = a.startTime ? Number(a.startTime.seconds) : 0;
      const bTime = b.startTime ? Number(b.startTime.seconds) : 0;
      return sortOrder === 'newest-first' ? bTime - aTime : aTime - bTime;
    });
    return sorted;
  }, [filteredTraces, sortOrder]);

  const groupedTraces = useMemo(() => groupTracesByDate(sortedTraces), [sortedTraces]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === 'newest-first' ? 'oldest-first' : 'newest-first'));
  };

  const toggleTrace = (traceId: string) => {
    setExpandedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) {
        next.delete(traceId);
      } else {
        next.add(traceId);
      }
      return next;
    });
  };

  // Collapse all traces when trigger changes
  useEffect(() => {
    if (collapseAllTrigger > 0) {
      setExpandedTraces(new Set());
    }
  }, [collapseAllTrigger]);

  const isFiltered = columnFilters.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar - Outside border (only render if not hidden) */}
      {!hideToolbar && <TracesDataTableToolbar table={table} traces={traces} />}

      {/* Split Panel Layout - With border */}
      <div className="flex h-[calc(100vh-300px)] min-h-[500px] overflow-hidden rounded-lg border">
        {/* Traces Table - Left Side */}
        <div className={selectedTraceId ? 'flex h-full min-w-0 flex-1 flex-col' : 'flex h-full w-full flex-col'}>
          <div className="flex flex-1 flex-col overflow-hidden bg-background">
            {/* Column Headers */}
            <div className="sticky top-0 flex items-center border-b bg-muted/50 font-medium text-[10px] text-muted-foreground">
              <button
                className="flex w-[72px] shrink-0 cursor-pointer items-center gap-1 px-2 py-1.5 transition-colors hover:text-foreground"
                onClick={toggleSortOrder}
                title={
                  sortOrder === 'newest-first'
                    ? 'Showing newest first. Click to show oldest first.'
                    : 'Showing oldest first. Click to show newest first.'
                }
                type="button"
              >
                <span>Time</span>
                {sortOrder === 'newest-first' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              </button>
              <div className="min-w-[280px] flex-1 px-1 py-1.5">Span</div>
              <div className="w-[260px] shrink-0 py-1.5 pr-6 pl-2">Duration</div>
            </div>

            {/* Table Body */}
            {(() => {
              if (isLoading) {
                return (
                  <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
                    Loading traces...
                  </div>
                );
              }

              if (error) {
                return (
                  <div className="flex h-24 items-center justify-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>Error loading traces: {error.message}</span>
                  </div>
                );
              }

              if (filteredTraces.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center gap-3 py-12">
                    <Inbox className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.5} />
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <h3 className="font-medium text-sm">No traces found</h3>
                      <p className="max-w-md text-muted-foreground text-xs leading-relaxed">
                        {isFiltered && hasUnfilteredData
                          ? 'No traces match your search criteria. Try adjusting your filter or clearing it.'
                          : `No traces have been recorded in the ${timeRange.toLowerCase()}. Traces will appear here once your agents start processing requests.`}
                      </p>
                      {isFiltered && hasUnfilteredData && (
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          <span className="font-medium">Tip:</span> Clear the search filter to see all traces
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <ScrollArea className="flex-1">
                  {groupedTraces.map(([dateKey, { label, traces: dateTraces }], index) => (
                    <div key={dateKey}>
                      {/* Date Separator */}
                      <div className="border-border/30 border-b py-1.5 text-center">
                        <span className="text-[10px] text-muted-foreground">
                          {label}
                          {index === 0 && (
                            <span className="ml-1.5 text-muted-foreground/60">
                              • {sortOrder === 'newest-first' ? 'Newest' : 'Oldest'}
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Traces for this date */}
                      {dateTraces.map((traceSummary) => (
                        <TraceGroup
                          collapseAllTrigger={collapseAllTrigger}
                          isExpanded={expandedTraces.has(traceSummary.traceId)}
                          key={traceSummary.traceId}
                          onSpanClick={onSpanClick}
                          onToggle={() => toggleTrace(traceSummary.traceId)}
                          traceSummary={traceSummary}
                        />
                      ))}
                    </div>
                  ))}
                </ScrollArea>
              );
            })()}
          </div>
        </div>

        {/* Details Panel - Right Side */}
        {selectedTraceId && selectedSpanId && (
          <div className="h-full w-[380px] flex-shrink-0 border-l">
            <TraceDetailsSheet
              isOpen={!!selectedTraceId && !!selectedSpanId}
              onClose={() => {
                setSelectedTraceId(null);
                setSelectedSpanId(null);
              }}
              spanId={selectedSpanId}
              traceId={selectedTraceId}
            />
          </div>
        )}
      </div>
    </div>
  );
};
