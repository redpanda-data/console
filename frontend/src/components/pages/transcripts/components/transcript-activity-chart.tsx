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

import type { Timestamp } from '@bufbuild/protobuf/wkt';
import { durationMs, timestampDate } from '@bufbuild/protobuf/wkt';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { TraceHistogram, TraceHistogramBucket } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { FC } from 'react';
import { useMemo, useState } from 'react';

type Props = {
  /** Histogram data from backend covering the full query time range */
  histogram: TraceHistogram | undefined;
  /** Start time of the oldest trace in the current loaded set */
  returnedStartTime: Timestamp | undefined;
  /** End time of the newest trace in the current loaded set */
  returnedEndTime: Timestamp | undefined;
  /** Total traces matching the query (for "Showing X of Y" display) */
  totalCount: number;
  /** Number of traces currently loaded */
  loadedCount: number;
  /** Query start time in milliseconds */
  queryStartMs: number;
  /** Query end time in milliseconds */
  queryEndMs: number;
  /** Whether we're viewing the latest traces (first page, not jumped) */
  isViewingLatest: boolean;
  /** Callback when a bucket is clicked for navigation */
  onBucketClick?: (bucketStartMs: number, bucketEndMs: number) => void;
};

/** Represents a time range with start and end timestamps in milliseconds */
type TimeRange = {
  startMs: number;
  endMs: number;
};

type DisplayWindowOptions = {
  loadedCount: number;
  totalCount: number;
  queryStartMs: number;
  queryEndMs: number;
  loadedDataRange: TimeRange | null;
  isViewingLatest: boolean;
};

/**
 * Calculates the time range to display on the chart axis based on pagination state.
 *
 * Three scenarios:
 * 1. All data loaded: Show full query range (covers gaps in data)
 * 2. Viewing latest: Extend from oldest loaded trace to query end (covers gap to "now")
 * 3. Historical/paginated: Show only loaded trace range
 */
const calculateChartAxisRange = (options: DisplayWindowOptions): TimeRange | null => {
  const { loadedCount, totalCount, queryStartMs, queryEndMs, loadedDataRange, isViewingLatest } = options;

  // Guard clause: No data loaded yet
  if (loadedDataRange === null) {
    return null;
  }

  // Scenario 1: All data is loaded - show full query range
  // Use >= to handle potential count synchronization issues
  if (loadedCount >= totalCount) {
    return { startMs: queryStartMs, endMs: queryEndMs };
  }

  // Scenario 2: Viewing latest (live tailing/first page) - anchor to the end
  if (isViewingLatest) {
    return { startMs: loadedDataRange.startMs, endMs: queryEndMs };
  }

  // Scenario 3: Historical viewing (page 2+ or jumped) - show only loaded data
  return loadedDataRange;
};

/**
 * Generates "nice" tick values for a chart Y-axis using the Nice Numbers algorithm.
 * Returns round numbers like 0, 20, 40, 60 instead of awkward values like 0, 33, 66.
 */
const calculateNiceTicks = (maxValue: number, targetTickCount = 3): number[] => {
  if (maxValue <= 0) {
    return [0, 10];
  }

  const rawStep = maxValue / targetTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;

  let niceFactor: number;
  if (normalizedStep <= 1.0) {
    niceFactor = 1;
  } else if (normalizedStep <= 2.0) {
    niceFactor = 2;
  } else if (normalizedStep <= 5.0) {
    niceFactor = 5;
  } else {
    niceFactor = 10;
  }

  const niceStep = niceFactor * magnitude;
  const ticks: number[] = [];
  let currentTick = 0;

  while (currentTick <= maxValue) {
    ticks.push(currentTick);
    currentTick += niceStep;
  }

  // Ensure we have a tick above maxValue
  const lastTick = ticks.at(-1) ?? 0;
  if (lastTick < maxValue) {
    ticks.push(lastTick + niceStep);
  }

  return ticks;
};

type BucketBarProps = {
  bucket: TraceHistogramBucket;
  bucketDurationMs: number;
  maxCount: number;
  isInWindow: boolean;
  isHovered: boolean;
  onBucketClick?: (bucketStartMs: number, bucketEndMs: number) => void;
  formatBucketTime: (startMs: number) => string;
  onHover: (isHovered: boolean) => void;
};

/** Hover tooltip for bucket bar */
type BucketTooltipProps = {
  time: string;
  successCount: number;
  errorCount: number;
  isInWindow: boolean;
};

const BucketTooltip: FC<BucketTooltipProps> = ({ time, successCount, errorCount, isInWindow }) => (
  <div
    className="pointer-events-none absolute z-50"
    style={{ bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }}
  >
    <div className="whitespace-nowrap rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-semibold text-foreground">{time}</div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">{successCount}</span>
        </div>
        {errorCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-muted-foreground">{errorCount}</span>
          </div>
        ) : null}
      </div>
      {isInWindow ? (
        <div className="mt-1.5 border-border/50 border-t pt-1.5 text-[10px] text-primary">In view</div>
      ) : null}
    </div>
  </div>
);

/** Helper to get bar color class based on state - uses static class names for Tailwind JIT */
const getBarColorClass = (isHovered: boolean, isInWindow: boolean, isSuccess: boolean): string => {
  if (isSuccess) {
    if (isHovered) {
      return 'bg-emerald-500';
    }
    if (isInWindow) {
      return 'bg-emerald-500/80';
    }
    return 'bg-emerald-500/40';
  }
  // Error bars
  if (isHovered) {
    return 'bg-red-500';
  }
  if (isInWindow) {
    return 'bg-red-500/80';
  }
  return 'bg-red-500/40';
};

/** Find the index range of buckets that overlap with a time window */
const findHighlightedBucketRange = (
  buckets: TraceHistogramBucket[],
  bucketDurationMs: number,
  windowStartMs: number,
  windowEndMs: number
): { first: number; last: number } | null => {
  let firstIndex = -1;
  let lastIndex = -1;

  for (let i = 0; i < buckets.length; i++) {
    const startTime = buckets[i].startTime;
    const bucketStartMs = startTime ? timestampDate(startTime).getTime() : 0;
    const bucketEndMs = bucketStartMs + bucketDurationMs;
    const overlaps = bucketEndMs > windowStartMs && bucketStartMs < windowEndMs;

    if (overlaps) {
      if (firstIndex === -1) {
        firstIndex = i;
      }
      lastIndex = i;
    }
  }

  if (firstIndex === -1) {
    return null;
  }
  return { first: firstIndex, last: lastIndex };
};

/** Individual histogram bucket bar with tooltip - uses stacked bars for success/errors */
const BucketBar: FC<BucketBarProps> = ({
  bucket,
  bucketDurationMs,
  maxCount,
  isInWindow,
  isHovered,
  onBucketClick,
  formatBucketTime,
  onHover,
}) => {
  const bucketStartMs = bucket.startTime ? timestampDate(bucket.startTime).getTime() : 0;
  const bucketEndMs = bucketStartMs + bucketDurationMs;
  const successCount = bucket.count - bucket.errorCount;
  const isClickable = Boolean(onBucketClick) && bucket.count > 0;

  // Calculate heights as percentages of the container (64px = h-16)
  const successHeight = maxCount > 0 ? (successCount / maxCount) * 100 : 0;
  const errorHeight = maxCount > 0 ? (bucket.errorCount / maxCount) * 100 : 0;

  const handleClick = () => {
    if (isClickable) {
      onBucketClick?.(bucketStartMs, bucketEndMs);
    }
  };

  const successBarClass = getBarColorClass(isHovered, isInWindow, true);
  const errorBarClass = getBarColorClass(isHovered, isInWindow, false);

  const containerClassName = cn('group relative h-full min-w-[4px] flex-1', isClickable && 'cursor-pointer');

  const barContent = (
    <>
      {isHovered ? (
        <BucketTooltip
          errorCount={bucket.errorCount}
          isInWindow={isInWindow}
          successCount={successCount}
          time={formatBucketTime(bucketStartMs)}
        />
      ) : null}
      <div className="absolute right-0 bottom-0 left-0 flex flex-col-reverse">
        <div
          className={cn('w-full transition-all', successBarClass, bucket.errorCount === 0 && 'rounded-t-sm')}
          style={{ height: `${(successHeight / 100) * 64}px` }}
        />
        {bucket.errorCount > 0 ? (
          <div
            className={cn('w-full rounded-t-sm transition-all', errorBarClass)}
            style={{ height: `${(errorHeight / 100) * 64}px` }}
          />
        ) : null}
      </div>
    </>
  );

  return isClickable ? (
    <button
      className={cn(containerClassName, 'border-0 bg-transparent p-0')}
      onClick={handleClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      type="button"
    >
      {barContent}
    </button>
  ) : (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Hover effect for visual tooltip feedback only
    <div
      aria-label={`Bucket with ${bucket.count} transcripts`}
      className={containerClassName}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      role="img"
    >
      {barContent}
    </div>
  );
};

export const TranscriptActivityChart: FC<Props> = ({
  histogram,
  returnedStartTime,
  returnedEndTime,
  totalCount,
  loadedCount,
  queryStartMs,
  queryEndMs,
  isViewingLatest,
  onBucketClick,
}) => {
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null);
  const buckets = histogram?.buckets ?? [];
  const bucketDurationMs = histogram?.bucketDuration ? durationMs(histogram.bucketDuration) : 0;

  // Calculate the loaded data range boundaries in milliseconds (from actual trace timestamps)
  const loadedDataRange: TimeRange | null = useMemo(() => {
    if (returnedStartTime === undefined || returnedEndTime === undefined) {
      return null;
    }
    return {
      startMs: timestampDate(returnedStartTime).getTime(),
      endMs: timestampDate(returnedEndTime).getTime(),
    };
  }, [returnedStartTime, returnedEndTime]);

  // Calculate the chart axis range to display based on pagination state
  const chartAxisRange = useMemo(
    () =>
      calculateChartAxisRange({
        loadedCount,
        totalCount,
        queryStartMs,
        queryEndMs,
        loadedDataRange,
        isViewingLatest,
      }),
    [loadedCount, totalCount, queryStartMs, queryEndMs, loadedDataRange, isViewingLatest]
  );

  // Calculate max count for scaling bar heights
  const maxCount = useMemo(() => Math.max(...buckets.map((b) => b.count), 1), [buckets]);

  // Calculate nice Y-axis ticks for clean round numbers
  const yAxisTicks = useMemo(() => calculateNiceTicks(maxCount, 3), [maxCount]);
  // Use the highest tick value as the scale max for bar heights
  const scaleMax = yAxisTicks.at(-1) ?? 1;

  // Format time labels for display - returns objects with key and label for stable rendering
  // Now shows 5 labels instead of 8 for cleaner appearance
  const timeLabels = useMemo(() => {
    if (buckets.length === 0) {
      return [];
    }

    const intervals = 4; // Show 5 time labels (start + 4 intervals)
    const totalDuration = queryEndMs - queryStartMs;

    return Array.from({ length: intervals + 1 }, (_, i) => {
      const time = queryStartMs + (totalDuration / intervals) * i;
      const date = new Date(time);

      // All labels show just time HH:MM format for cleaner look
      const label = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

      return { key: time, label };
    });
  }, [buckets.length, queryStartMs, queryEndMs]);

  // Check if a bucket is within the chart axis range (loaded data indicator)
  const isBucketInChartAxisRange = (bucketStartMs: number): boolean => {
    if (chartAxisRange === null) {
      return false;
    }
    const bucketEndMs = bucketStartMs + bucketDurationMs;
    // Bucket overlaps with the displayed axis range
    return bucketEndMs > chartAxisRange.startMs && bucketStartMs < chartAxisRange.endMs;
  };

  // Format bucket time for tooltip (just HH:MM format)
  const formatBucketTime = (startMs: number): string => {
    const date = new Date(startMs);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Format visible window time for header
  const formatVisibleWindowTime = (ms: number): string =>
    new Date(ms).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  // Calculate the overlay position based on which buckets fall within the chart axis range
  // This visual indicator shows what portion of the timeline contains loaded data
  const overlayStyle = useMemo(() => {
    if (chartAxisRange === null || buckets.length === 0) {
      return null;
    }

    const range = findHighlightedBucketRange(buckets, bucketDurationMs, chartAxisRange.startMs, chartAxisRange.endMs);
    if (range === null) {
      return null;
    }

    const leftPercent = (range.first / buckets.length) * 100;
    const widthPercent = ((range.last - range.first + 1) / buckets.length) * 100;

    // Always show the overlay when we have a valid range
    // This provides useful information about what portion of the timeline has loaded data
    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  }, [chartAxisRange, buckets, bucketDurationMs]);

  if (buckets.length === 0) {
    return (
      <div className="relative z-0 mb-3 rounded-lg border bg-muted/20">
        <div className="flex h-16 items-center justify-center">
          <span className="text-[10px] text-muted-foreground">No transcript data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-0 mb-3 rounded-lg border bg-muted/20">
      {/* Header bar */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5 text-[10px]">
          <span className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{loadedCount.toLocaleString()}</span> of{' '}
            <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span> transcripts
            {chartAxisRange !== null && (
              <>
                {' '}
                from{' '}
                <span className="font-medium text-foreground">{formatVisibleWindowTime(chartAxisRange.startMs)}</span>{' '}
                to <span className="font-medium text-foreground">{formatVisibleWindowTime(chartAxisRange.endMs)}</span>
              </>
            )}
          </span>
        </div>
      )}

      {/* Histogram Bars */}
      <div className="relative px-2 pt-4 pb-1">
        <div className="relative flex">
          {/* Y-axis labels */}
          <div className="relative mr-2 flex w-8 shrink-0 flex-col justify-between text-right text-[9px] text-muted-foreground">
            {[...yAxisTicks].reverse().map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          {/* Bars container */}
          <div className="relative flex-1">
            {/* Subtle horizontal grid lines */}
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {yAxisTicks.map((tick, i) => (
                <div
                  className={cn(
                    'h-px w-full',
                    i === 0 || i === yAxisTicks.length - 1 ? 'bg-border/40' : 'bg-border/30'
                  )}
                  key={tick}
                />
              ))}
            </div>

            <div className="relative flex h-16 items-end gap-px">
              {buckets.map((bucket, index) => {
                const bucketStartMs = bucket.startTime ? timestampDate(bucket.startTime).getTime() : 0;
                return (
                  <BucketBar
                    bucket={bucket}
                    bucketDurationMs={bucketDurationMs}
                    formatBucketTime={formatBucketTime}
                    isHovered={hoveredBucket === index}
                    isInWindow={isBucketInChartAxisRange(bucketStartMs)}
                    key={bucketStartMs}
                    maxCount={scaleMax}
                    onBucketClick={onBucketClick}
                    onHover={(isHovered) => setHoveredBucket(isHovered ? index : null)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Visible window range indicator - shows which portion of the timeline is loaded */}
        {overlayStyle !== null && (
          <div className="relative mt-1.5 ml-10 h-1 bg-muted/50">
            {/* Visible range highlight */}
            <div className="absolute h-full bg-foreground/20" style={overlayStyle} />
            {/* Left edge marker */}
            <div
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-foreground/40"
              style={{ left: overlayStyle.left }}
            />
            {/* Right edge marker */}
            <div
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-foreground/40"
              style={{ left: `calc(${overlayStyle.left} + ${overlayStyle.width})` }}
            />
          </div>
        )}

        {/* Time Labels - offset to align with bars (w-8 + mr-2 = 40px = ml-10) */}
        <div className="mt-1.5 ml-10 flex justify-between px-0.5 text-[9px] text-muted-foreground">
          {timeLabels.map((item) => (
            <span key={item.key}>{item.label}</span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-t px-3 py-1.5 text-[9px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm bg-emerald-500/70" />
          <span>Successful</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm bg-red-500/70" />
          <span>Errors</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative h-2 w-6 bg-muted/50">
            <div className="absolute right-0 h-full w-1/2 bg-foreground/20" />
            <div className="absolute top-1/2 right-0 h-3 w-0.5 -translate-y-1/2 bg-foreground/40" />
            <div className="absolute top-1/2 right-1/2 h-3 w-0.5 -translate-y-1/2 bg-foreground/40" />
          </div>
          <span>Loaded data</span>
        </div>
      </div>
    </div>
  );
};
