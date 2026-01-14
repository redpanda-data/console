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

import { durationMs } from '@bufbuild/protobuf/wkt';
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
import { Spinner } from 'components/redpanda-ui/components/spinner';
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { formatDuration, formatTime } from '../utils/trace-formatters';
import { groupTracesByDate, isIncompleteTrace } from '../utils/trace-statistics';

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
  }, [traces]);

  const serviceColumn = table.getColumn('rootServiceName');

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center gap-2">
        <Input
          className="h-8 w-[150px]"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            table.getColumn('searchable')?.setFilterValue(event.target.value)
          }
          placeholder="Search traces..."
          testId="traces-search-input"
          value={(table.getColumn('searchable')?.getFilterValue() as string) ?? ''}
        />
        {serviceColumn && serviceOptions.length > 0 && (
          <DataTableFacetedFilter column={serviceColumn} options={serviceOptions} title="Service" />
        )}
        {table.getColumn('status') && (
          <DataTableFacetedFilter column={table.getColumn('status')} options={statusOptions} title="Status" />
        )}
        {!!isFiltered && (
          <Button onClick={() => table.resetColumnFilters()} size="sm" variant="ghost">
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

type Props = {
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
  /**
   * Disable expensive table features (faceting) for testing or performance.
   * When true, getFacetedRowModel and getFacetedUniqueValues are not used.
   * This significantly reduces memory consumption in tests.
   * @default false
   */
  disableFaceting?: boolean;
};

// Helper: Calculate next parent depths for child spans
const getNextParentDepths = (parentDepths: number[], depth: number, isLastChild: boolean): number[] => {
  const parentColumnIndex = depth - 1;

  if (isLastChild) {
    return parentDepths.filter((d) => d !== parentColumnIndex);
  }
  if (parentDepths.includes(parentColumnIndex)) {
    return parentDepths;
  }
  return [...parentDepths, parentColumnIndex];
};

// Helper: Calculate tree line connector flags for a span row
const getSpanRowLineFlags = (depth: number, isLastChild: boolean, parentDepths: number[]) => {
  const drawCol0Vertical = parentDepths.includes(0) || depth === 1;
  const col0VerticalHeight = isLastChild && depth === 1 ? '50%' : 'calc(100% + 1px)';

  return {
    drawCol0Vertical,
    col0VerticalHeight,
  };
};

// Tree gutter column component - renders a single column in the tree structure
type GutterColumnProps = {
  colIndex: number;
  depth: number;
  isLastChild: boolean;
  parentDepths: number[];
};

const GutterColumn: FC<GutterColumnProps> = ({ colIndex, depth, isLastChild, parentDepths }) => {
  const isCurrentColumn = colIndex === depth - 1;
  const drawAncestorContinuation = parentDepths.includes(colIndex);

  return (
    <div
      className="relative flex w-6 items-center justify-center"
      style={{ '--tree-x': '11px' } as React.CSSProperties}
    >
      {!!drawAncestorContinuation && (
        <div className="absolute top-0 bottom-0 w-px bg-border" style={{ left: 'var(--tree-x)' }} />
      )}
      {!!isCurrentColumn && (
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
};

// Tree lines component - renders the full tree structure for a span row
type TreeLinesProps = {
  depth: number;
  isLastChild: boolean;
  parentDepths: number[];
  isExpanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
};

const TreeLines: FC<TreeLinesProps> = ({ depth, isLastChild, parentDepths, isExpanded, hasChildren, onToggle }) => {
  const lineFlags = getSpanRowLineFlags(depth, isLastChild, parentDepths);

  return (
    <div className="flex h-8 shrink-0 items-stretch">
      {/* First column (gutter column 0) */}
      <div
        className="relative flex w-5 items-center justify-center"
        style={{ '--tree-x': '9px' } as React.CSSProperties}
      >
        {!!lineFlags.drawCol0Vertical && (
          <div
            className="absolute top-0 w-px bg-border"
            style={{ left: 'var(--tree-x)', height: lineFlags.col0VerticalHeight }}
          />
        )}
        {depth === 1 && <div className="absolute top-1/2 h-px w-[11px] bg-border" style={{ left: 'var(--tree-x)' }} />}
      </div>

      {/* Additional gutter columns (1..depth-1) */}
      {Array.from({ length: Math.max(0, depth - 1) }).map((_, i) => {
        const colIndex = i + 1;
        return (
          <GutterColumn
            colIndex={colIndex}
            depth={depth}
            isLastChild={isLastChild}
            key={`gutter-col-${colIndex}`}
            parentDepths={parentDepths}
          />
        );
      })}

      {/* Chevron button as final tree column */}
      <div
        className="relative flex h-8 w-5 shrink-0 items-center"
        style={{ '--tree-x': '11px' } as React.CSSProperties}
      >
        {!!(isExpanded && hasChildren) && (
          <div className="absolute top-1/2 bottom-0 w-px bg-border" style={{ left: 'var(--tree-x)' }} />
        )}
        <Button
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-label={hasChildren ? `${isExpanded ? 'Collapse' : 'Expand'} child spans` : undefined}
          className={cn('absolute z-10 h-4 w-4 shrink-0 -translate-x-1/2', !hasChildren && 'invisible')}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          size="icon"
          style={{ left: 'var(--tree-x)' }}
          tabIndex={hasChildren ? 0 : -1}
          variant="ghost"
        >
          {isExpanded ? (
            <ChevronDown aria-hidden="true" className="h-3 w-3" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
};

// Span Row Component with tree lines
type SpanRowProps = {
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
};

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

  return (
    <>
      <button
        aria-label={`View span ${span.name}${span.hasError ? ', has error' : ''}`}
        className={cn(
          'grid h-8 w-full cursor-pointer items-center border-border/30 border-b text-left transition-colors hover:bg-muted/50',
          '[grid-template-columns:72px_minmax(0,1fr)_260px]'
        )}
        data-testid={`span-row-${span.spanId}`}
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
        <div className="shrink-0 px-2 py-1">
          <span className="font-mono text-[10px] text-muted-foreground">{formatTime(spanTimestamp)}</span>
        </div>

        {/* Span Info with Tree Lines */}
        <div className="flex min-w-0 items-center gap-1 overflow-hidden px-1 py-1">
          {/* Tree structure lines */}
          {depth > 0 && (
            <TreeLines
              depth={depth}
              hasChildren={hasChildren}
              isExpanded={isExpanded}
              isLastChild={isLastChild}
              onToggle={onToggle}
              parentDepths={parentDepths}
            />
          )}

          {/* Service badge */}
          <Badge
            className="flex h-4 max-w-[150px] shrink-0 items-center border-border bg-muted/50 px-1.5 py-0 font-normal text-[10px] text-muted-foreground"
            variant="outline"
          >
            <Icon className="mr-1 h-3 w-3 shrink-0" />
            <span className="truncate" title={serviceName}>
              {serviceName}
            </span>
          </Badge>

          {/* Children count */}
          {!!hasChildren && (
            <Badge
              className="h-4 shrink-0 border-border bg-muted/50 px-1 py-0 font-mono text-[10px] text-muted-foreground"
              variant="outline"
            >
              {span.children?.length || 0}
            </Badge>
          )}

          {/* Span name - wrapped in container for proper truncation */}
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[11px]" title={span.name}>
              {span.name}
            </span>
          </div>

          {/* Error badge */}
          {!!span.hasError && (
            <Badge className="shrink-0 text-xs" variant="destructive">
              Error
            </Badge>
          )}
        </div>

        {/* Duration Bar */}
        <div className="flex shrink-0 items-center gap-2 py-1 pr-6 pl-2">
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
      {!!(isExpanded && expandedSpans && toggleSpan) &&
        span.children?.map((child, index) => {
          const nextParentDepths = getNextParentDepths(parentDepths, depth, isLastChild);
          return (
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
          );
        })}
    </>
  );
};

// Helper: Initialize expanded spans (spans at depth <= 2)
const computeInitialExpandedSpans = (spanTree: SpanNode[]): Set<string> => {
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
};

// Custom hook: Manage span expansion state
const useSpanExpansion = (spanTree: SpanNode[], collapseAllTrigger: number) => {
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(() => computeInitialExpandedSpans(spanTree));
  const prevSpanTreeLength = useRef(0);

  // Reset to initial state when collapse all is triggered
  useEffect(() => {
    if (collapseAllTrigger > 0 && spanTree.length > 0) {
      setExpandedSpans(computeInitialExpandedSpans(spanTree));
    }
  }, [collapseAllTrigger, spanTree]);

  // Sync expansion state when spanTree loads (handles async data loading)
  useEffect(() => {
    const currentLength = spanTree.length;

    // Only run if transitioning from empty (0) to populated (N)
    // AND we currently have no expanded spans
    if (prevSpanTreeLength.current === 0 && currentLength > 0 && expandedSpans.size === 0) {
      const initialSpans = computeInitialExpandedSpans(spanTree);
      if (initialSpans.size > 0) {
        setExpandedSpans(initialSpans);
      }
    }

    // Update ref for next render
    prevSpanTreeLength.current = currentLength;
  }, [spanTree, expandedSpans.size]);

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

  return { expandedSpans, toggleSpan };
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

// Helper: Root trace service badge
const RootTraceServiceBadge: FC<{ isIncomplete: boolean; serviceName: string | undefined }> = ({
  isIncomplete,
  serviceName,
}) => {
  if (isIncomplete) {
    return (
      <Badge
        className="flex h-4 shrink-0 items-center border-amber-500/30 bg-amber-500/10 px-1.5 py-0 font-normal text-[10px] text-amber-600"
        variant="outline"
      >
        <AlertCircle className="mr-1 h-3 w-3 shrink-0" />
        <span className="truncate">awaiting root</span>
      </Badge>
    );
  }
  return (
    <Badge
      className="flex h-4 max-w-[150px] shrink-0 items-center border-border bg-muted/50 px-1.5 py-0 font-normal text-[10px] text-muted-foreground"
      variant="outline"
    >
      <Cpu className="mr-1 h-3 w-3 shrink-0" />
      <span className="truncate" title={serviceName || 'service'}>
        {serviceName || 'service'}
      </span>
    </Badge>
  );
};

// Helper: Root trace duration cell
const RootTraceDurationCell: FC<{
  isIncomplete: boolean;
  hasErrors: boolean;
  durationMs: number;
}> = ({ isIncomplete, hasErrors, durationMs: duration }) => {
  if (isIncomplete) {
    return (
      <>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full rounded-full bg-amber-500/30" />
        </div>
        <span className="w-14 shrink-0 text-left font-mono text-[10px] text-muted-foreground">—</span>
      </>
    );
  }
  return (
    <>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-muted/30">
        <div
          className={cn('h-full rounded-sm', hasErrors ? 'bg-red-500/70' : 'bg-sky-500/70')}
          style={{ width: '100%' }}
        />
      </div>
      <span className="w-14 shrink-0 text-left font-mono text-[10px] text-muted-foreground">
        {formatDuration(duration)}
      </span>
    </>
  );
};

// Component: Root trace row
const RootTraceRow: FC<{
  traceSummary: TraceSummary;
  isExpanded: boolean;
  onToggle: () => void;
  spanTreeLength: number;
  isIncomplete: boolean;
}> = ({ traceSummary, isExpanded, onToggle, spanTreeLength, isIncomplete }) => {
  const baseTimestamp = traceSummary.startTime ? new Date(Number(traceSummary.startTime.seconds) * 1000) : new Date();

  return (
    <button
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} trace ${traceSummary.rootSpanName || 'unnamed'}, ${traceSummary.spanCount} spans`}
      className={cn(
        'grid h-9 w-full cursor-pointer items-center border-border/40 border-b bg-muted/10 text-left transition-colors hover:bg-muted/30',
        '[grid-template-columns:72px_minmax(0,1fr)_260px]',
        isIncomplete && 'bg-amber-500/5 hover:bg-amber-500/10'
      )}
      data-testid={`trace-row-${traceSummary.traceId}`}
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
      <div className="shrink-0 px-2 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">{formatTime(baseTimestamp)}</span>
      </div>

      {/* Message column */}
      <div className="flex min-w-0 items-center gap-1 overflow-hidden px-1 py-1.5">
        {/* Expand button with vertical line container */}
        <div
          className="relative flex h-8 w-5 shrink-0 items-center"
          style={{ '--tree-x': '9px' } as React.CSSProperties}
        >
          {/* Vertical line when expanded */}
          {isExpanded && spanTreeLength > 0 && (
            <div className="absolute top-1/2 bottom-0 w-px bg-border" style={{ left: 'var(--tree-x)' }} />
          )}
          <Button
            aria-hidden="true"
            className="absolute z-10 h-4 w-4 shrink-0 -translate-x-1/2"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            size="icon"
            style={{ left: 'var(--tree-x)' }}
            tabIndex={-1}
            variant="ghost"
          >
            {isExpanded ? (
              <ChevronDown aria-hidden="true" className="h-3 w-3" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Service badge or incomplete badge */}
        <RootTraceServiceBadge isIncomplete={isIncomplete} serviceName={traceSummary.rootServiceName} />

        {/* Span count */}
        <Badge
          className="h-4 shrink-0 border-border bg-muted/50 px-1 py-0 font-mono text-[10px] text-muted-foreground"
          variant="outline"
        >
          {traceSummary.spanCount}
        </Badge>

        {/* Trace name - wrapped in container for proper truncation */}
        <div className="min-w-0 flex-1">
          <span
            className={cn('block truncate text-[11px]', isIncomplete && 'text-muted-foreground italic')}
            title={traceSummary.rootSpanName}
          >
            {isIncomplete
              ? `${traceSummary.rootServiceName || 'unknown'} — waiting for parent span`
              : traceSummary.rootSpanName}
          </span>
        </div>

        {/* Error badge */}
        {traceSummary.errorCount > 0 && (
          <Badge className="shrink-0 text-xs" variant="destructive">
            Error
          </Badge>
        )}
      </div>

      {/* Duration column */}
      <div className="flex shrink-0 items-center gap-2 py-1.5 pr-6 pl-2">
        <RootTraceDurationCell
          durationMs={traceSummary.duration ? durationMs(traceSummary.duration) : 0}
          hasErrors={traceSummary.errorCount > 0}
          isIncomplete={isIncomplete}
        />
      </div>
    </button>
  );
};

// Component: Expanded spans content
const ExpandedSpansContent: FC<{
  isLoading: boolean;
  error: Error | null | undefined;
  spanTree: SpanNode[];
  baseTimestamp: Date;
  expandedSpans: Set<string>;
  toggleSpan: (spanId: string) => void;
  timeline: ReturnType<typeof calculateTimeline>;
  onSpanClick: (traceId: string, spanId: string) => void;
  traceId: string;
}> = ({ isLoading, error, spanTree, baseTimestamp, expandedSpans, toggleSpan, timeline, onSpanClick, traceId }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 text-center text-muted-foreground text-sm">
        <Spinner size="sm" />
        Loading spans...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 text-center text-red-600 text-sm">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load trace: {error.message}</span>
      </div>
    );
  }

  if (spanTree.length === 0) {
    return <div className="p-4 text-center text-muted-foreground text-sm">No spans found</div>;
  }

  return (
    <>
      {spanTree.map((span, index) => (
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
          traceId={traceId}
        />
      ))}
    </>
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

  // Manage span expansion state
  const { expandedSpans, toggleSpan } = useSpanExpansion(spanTree, collapseAllTrigger);

  const baseTimestamp = traceSummary.startTime ? new Date(Number(traceSummary.startTime.seconds) * 1000) : new Date();
  const isIncomplete = isIncompleteTrace(traceSummary.rootSpanName);

  return (
    <>
      <RootTraceRow
        isExpanded={isExpanded}
        isIncomplete={isIncomplete}
        onToggle={onToggle}
        spanTreeLength={spanTree.length}
        traceSummary={traceSummary}
      />
      {!!isExpanded && (
        <ExpandedSpansContent
          baseTimestamp={baseTimestamp}
          error={error}
          expandedSpans={expandedSpans}
          isLoading={isLoading}
          onSpanClick={onSpanClick}
          spanTree={spanTree}
          timeline={timeline}
          toggleSpan={toggleSpan}
          traceId={traceSummary.traceId}
        />
      )}
    </>
  );
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
  disableFaceting = false,
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
          // Searchable field combining traceId, rootSpanName, and rootServiceName
          searchable: `${trace.traceId} ${trace.rootSpanName} ${trace.rootServiceName}`,
          // Status field for filtering
          status,
        };
      }),
    [traces]
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

  // TanStack Table setup with conditional faceting
  const table = useReactTable<EnhancedTraceSummary>({
    data: enhancedTraces,
    columns,
    onColumnFiltersChange: (updaterOrValue) => {
      const newFilters = typeof updaterOrValue === 'function' ? updaterOrValue(columnFilters) : updaterOrValue;
      setColumnFilters(newFilters);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Only enable expensive faceting features when needed (disabled in tests by default)
    getFacetedRowModel: disableFaceting ? undefined : getFacetedRowModel(),
    getFacetedUniqueValues: disableFaceting ? undefined : getFacetedUniqueValues(),
    state: tableState,
  });

  // Get filtered traces from table (recreated when data or filters change)
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
            <div className="sticky top-0 grid items-center border-b bg-muted/50 font-medium text-[10px] text-muted-foreground [grid-template-columns:72px_minmax(0,1fr)_260px]">
              <button
                aria-label={
                  sortOrder === 'newest-first'
                    ? 'Sort by time, currently newest first'
                    : 'Sort by time, currently oldest first'
                }
                className="flex shrink-0 cursor-pointer items-center gap-1 px-2 py-1.5 transition-colors hover:text-foreground"
                data-testid="traces-sort-toggle"
                onClick={toggleSortOrder}
                title={
                  sortOrder === 'newest-first'
                    ? 'Showing newest first. Click to show oldest first.'
                    : 'Showing oldest first. Click to show newest first.'
                }
                type="button"
              >
                <span>Time</span>
                {sortOrder === 'newest-first' ? (
                  <ArrowDown aria-hidden="true" className="h-3 w-3" />
                ) : (
                  <ArrowUp aria-hidden="true" className="h-3 w-3" />
                )}
              </button>
              <div className="min-w-0 px-1 py-1.5">Span</div>
              <div className="shrink-0 py-1.5 pr-6 pl-2">Duration</div>
            </div>

            {/* Table Body */}
            {(() => {
              if (isLoading) {
                return (
                  <div className="flex h-24 items-center justify-center gap-2 text-muted-foreground text-sm">
                    <Spinner size="sm" />
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
                      {!!(isFiltered && hasUnfilteredData) && (
                        <p className="mt-1 text-[11px] text-muted-foreground/70">
                          <span className="font-medium">Tip:</span> Clear the search filter to see all traces
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <ScrollArea className="min-h-0 flex-1">
                  {/* Add padding-bottom to prevent last rows from being cut off when scrolled to bottom */}
                  <div className="pb-4">
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
                  </div>
                </ScrollArea>
              );
            })()}
          </div>
        </div>

        {/* Details Panel - Right Side */}
        {!!(selectedTraceId && selectedSpanId) && (
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
