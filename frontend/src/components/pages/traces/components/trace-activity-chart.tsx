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

import { timestampDate } from '@bufbuild/protobuf/wkt';
import type { TraceSummary } from 'protogen/redpanda/api/dataplane/v1alpha3/tracing_pb';
import type { FC } from 'react';
import { useMemo } from 'react';
import { pluralizeWithNumber } from 'utils/string';

type Props = {
  traces: TraceSummary[];
  timeRangeMs: number;
};

export const TraceActivityChart: FC<Props> = ({ traces, timeRangeMs }) => {
  const chartData = useMemo(() => {
    if (traces.length === 0) {
      return [];
    }

    const now = Date.now();
    const startTime = now - timeRangeMs;

    // Use 60 buckets for better granularity (similar to v0 mock)
    const bucketCount = 60;
    const bucketSize = timeRangeMs / bucketCount;

    const buckets = Array.from({ length: bucketCount }, (_, i) => {
      const bucketStart = startTime + i * bucketSize;

      return {
        timestamp: bucketStart,
        count: 0,
      };
    });

    for (const trace of traces) {
      if (!trace.startTime) {
        continue;
      }

      const traceTime = timestampDate(trace.startTime).getTime();
      const bucketIndex = Math.floor((traceTime - startTime) / bucketSize);

      if (bucketIndex >= 0 && bucketIndex < buckets.length) {
        buckets[bucketIndex].count += 1;
      }
    }

    return buckets;
  }, [traces, timeRangeMs]);

  const maxCount = useMemo(() => Math.max(...chartData.map((d) => d.count), 1), [chartData]);

  // Format time labels for display
  const timeLabels = useMemo(() => {
    if (chartData.length === 0) {
      return [];
    }

    const now = Date.now();
    const startTime = now - timeRangeMs;
    const intervals = 7; // Show 8 time labels (start + 7 intervals)

    return Array.from({ length: intervals + 1 }, (_, i) => {
      const time = startTime + (timeRangeMs / intervals) * i;
      const date = new Date(time);

      if (i === 0 || i === intervals) {
        // First and last label: show date and full time
        return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
      }
      // Middle labels: just time
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    });
  }, [chartData.length, timeRangeMs]);

  if (chartData.length === 0) {
    return (
      <div className="mb-3 rounded-lg border bg-muted/20 p-2">
        <div className="flex h-10 items-center justify-center">
          <span className="text-[10px] text-muted-foreground">No trace data available</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-lg border bg-muted/20 p-2">
      {/* Histogram Bars */}
      <div className="flex h-10 items-end gap-px">
        {chartData.map((bucket) => {
          const height = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
          return (
            <div
              className="min-w-[2px] flex-1 rounded-t-sm bg-emerald-500/70 transition-all hover:bg-emerald-500"
              key={bucket.timestamp}
              style={{ height: `${height}%` }}
              title={pluralizeWithNumber(bucket.count, 'trace')}
            />
          );
        })}
      </div>

      {/* Time Labels */}
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        {timeLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
};
