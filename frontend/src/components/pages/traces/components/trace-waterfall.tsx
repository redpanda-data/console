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

import { Badge } from 'components/redpanda-ui/components/badge';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useMemo } from 'react';

import {
  buildSpanTree,
  calculateOffset,
  calculateTimeline,
  calculateWidth,
  type SpanNode,
} from '../utils/span-tree-builder';
import { formatDuration } from '../utils/trace-formatters';

interface Props {
  spans: Span[];
}

const SpanRow: FC<{ span: SpanNode; timeline: ReturnType<typeof calculateTimeline>; depth: number }> = ({
  span,
  timeline,
  depth,
}) => {
  const offset = calculateOffset(span.startTime, timeline);
  const width = calculateWidth(span.duration, timeline);

  return (
    <>
      <div
        className={cn('flex items-center gap-2 rounded px-2 py-2 transition-colors hover:bg-muted/50')}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="truncate text-sm">{span.name}</div>
          {span.hasError && (
            <Badge className="text-xs" variant="destructive">
              Error
            </Badge>
          )}
        </div>
        <div className="relative h-6 flex-1 rounded bg-muted/20">
          <div
            className={cn('absolute h-full rounded transition-all', span.hasError ? 'bg-destructive' : 'bg-primary')}
            style={{
              left: `${Math.max(0, offset)}%`,
              width: `${Math.min(100 - Math.max(0, offset), width)}%`,
            }}
            title={`${span.name}\nDuration: ${formatDuration(span.duration)}`}
          />
        </div>
        <div className="w-24 text-right font-mono text-muted-foreground text-xs">{formatDuration(span.duration)}</div>
      </div>
      {span.children?.map((child) => (
        <SpanRow depth={depth + 1} key={child.spanId} span={child} timeline={timeline} />
      ))}
    </>
  );
};

export const TraceWaterfall: FC<Props> = ({ spans }) => {
  const tree = useMemo(() => buildSpanTree(spans), [spans]);
  const timeline = useMemo(() => calculateTimeline(tree), [tree]);

  if (tree.length === 0) {
    return <div className="rounded bg-muted/10 p-8 text-center text-muted-foreground">No spans available</div>;
  }

  return (
    <div className="rounded border bg-background">
      <div className="max-h-[400px] space-y-1 overflow-y-auto p-2">
        {tree.map((node) => (
          <SpanRow depth={0} key={node.spanId} span={node} timeline={timeline} />
        ))}
      </div>
    </div>
  );
};
