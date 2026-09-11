/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { timestampFromMs } from '@bufbuild/protobuf/wkt';
import { Button } from 'components/redpanda-ui/components/button';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from 'components/redpanda-ui/components/chart';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { ChartSkeleton } from 'components/ui/chart-skeleton';
import { RefreshButton } from 'components/ui/refresh-button';
import type { FC, ReactNode } from 'react';
import { useCallback, useId, useMemo, useState } from 'react';
import { useExecuteRangeQuery, useListQueries } from 'react-query/api/observability';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  formatChartTimestamp,
  formatTooltipLabel,
  type MergedPoint,
  mergeTimeSeries,
} from 'utils/pipeline-throughput.utils';
import { calculateTimeRange, getEvenlySpacedTimeTicks, getTimeRanges, type TimeRange } from 'utils/time-range';

// Cap at 12h: the range-query backend can't serve a wider window at its default resolution (Prometheus' 11k-point limit).
const TIME_RANGES = getTimeRanges(12 * 60 * 60 * 1000);

const chartConfig = {
  ingress: { label: 'Ingress', color: 'var(--color-primary)' },
  egress: { label: 'Egress', color: 'var(--color-secondary)' },
} satisfies ChartConfig;

type ThroughputContentProps = {
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
  chartData: MergedPoint[];
  id: string;
  // Full selected window [start, end] in ms, so the axis spans it even when data is sparse.
  domain: [number, number];
  onRetry: () => void;
};

// h-40 matches the chart so the section doesn't jump between states. Empty's own padding and title
// scale are built for full-page empties, and would crowd the text out of a box this size.
const ThroughputPlaceholder: FC<{ title: string; description: string; action?: ReactNode }> = ({
  title,
  description,
  action,
}) => (
  <Empty className="h-40 gap-2 rounded-md border border-dashed p-4 md:p-4">
    <EmptyHeader className="gap-1">
      <EmptyTitle className="text-body">{title}</EmptyTitle>
      <EmptyDescription className="text-body">{description}</EmptyDescription>
    </EmptyHeader>
    {action ? <EmptyContent>{action}</EmptyContent> : null}
  </Empty>
);

const ThroughputContent: FC<ThroughputContentProps> = ({
  isLoading,
  isError,
  hasData,
  chartData,
  id,
  domain,
  onRetry,
}) => {
  if (isLoading) {
    return <ChartSkeleton className="h-40 w-full" variant="area" />;
  }

  if (isError) {
    return (
      <ThroughputPlaceholder
        action={
          <Button onClick={onRetry} size="sm" variant="outline">
            Try again
          </Button>
        }
        description="The metrics service didn't respond. Data will appear once it's reachable."
        title="Throughput metrics aren't available right now"
      />
    );
  }

  if (!hasData) {
    return (
      <ThroughputPlaceholder
        description="Metrics appear here a few minutes after the pipeline starts processing messages."
        title="No throughput data yet"
      />
    );
  }

  return (
    <ChartContainer className="h-40 w-full" config={chartConfig}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id={`${id}-ingress`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--color-ingress)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-ingress)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id={`${id}-egress`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--color-egress)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-egress)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="timestamp"
          domain={domain}
          scale="time"
          tickFormatter={formatChartTimestamp}
          tickLine={false}
          tickMargin={8}
          ticks={getEvenlySpacedTimeTicks(domain[0], domain[1])}
          type="number"
        />
        <YAxis axisLine={false} tickLine={false} tickMargin={8} width={40} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const ts = payload?.[0]?.payload?.timestamp;
                if (!ts || typeof ts !== 'number') {
                  return '';
                }
                return formatTooltipLabel(ts);
              }}
            />
          }
        />
        <Area
          dataKey="ingress"
          fill={`url(#${id}-ingress)`}
          stroke="var(--color-ingress)"
          strokeWidth={2}
          type="monotone"
        />
        <Area
          dataKey="egress"
          fill={`url(#${id}-egress)`}
          stroke="var(--color-egress)"
          strokeWidth={2}
          type="monotone"
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
};

type PipelineThroughputCardProps = {
  pipelineId: string;
};

export const PipelineThroughputCard: FC<PipelineThroughputCardProps> = ({ pipelineId }) => {
  const id = useId();
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('1h');
  const [refreshKey, setRefreshKey] = useState(0);

  const {
    data: queriesData,
    isLoading: isLoadingQueries,
    isError: isErrorQueries,
    refetch: refetchQueries,
  } = useListQueries({
    filter: {
      tags: {
        component: 'redpanda-connect',
      },
    },
  });

  const hasInputQuery = queriesData?.queries?.some((q) => q.name === 'connect_input_received') ?? false;
  const hasOutputQuery = queriesData?.queries?.some((q) => q.name === 'connect_output_sent') ?? false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey triggers recalculation on refresh
  const timeRange = useMemo(() => calculateTimeRange(selectedTimeRange), [selectedTimeRange, refreshKey]);
  const timeParams = {
    start: timestampFromMs(timeRange.start.getTime()),
    end: timestampFromMs(timeRange.end.getTime()),
  };

  const {
    data: ingressData,
    isError: isErrorIngress,
    isPending: isPendingIngress,
    isFetching: isFetchingIngress,
  } = useExecuteRangeQuery(
    {
      queryName: 'connect_input_received',
      params: { ...timeParams, filters: { pipeline_id: pipelineId } },
    },
    { enabled: hasInputQuery }
  );

  const {
    data: egressData,
    isError: isErrorEgress,
    isPending: isPendingEgress,
    isFetching: isFetchingEgress,
  } = useExecuteRangeQuery(
    {
      queryName: 'connect_output_sent',
      params: { ...timeParams, filters: { pipeline_id: pipelineId } },
    },
    { enabled: hasOutputQuery }
  );

  const handleRefresh = useCallback(() => {
    // The query-catalog key carries no timestamps, so a refreshKey bump alone never retries a failed
    // ListQueries.
    refetchQueries();
    setRefreshKey((prev) => prev + 1);
  }, [refetchQueries]);

  const chartData = useMemo(
    () => mergeTimeSeries(ingressData?.results ?? [], egressData?.results ?? []),
    [ingressData, egressData]
  );

  // isPending stays true for disabled queries, so only count enabled ones to avoid an infinite skeleton.
  const isLoading = isLoadingQueries || (hasInputQuery && isPendingIngress) || (hasOutputQuery && isPendingEgress);
  // A failed catalog lookup is the error state, not "no data yet": the range queries never run.
  const isError = isErrorQueries || isErrorIngress || isErrorEgress;
  const isFetching = isFetchingIngress || isFetchingEgress;
  const hasData = chartData.length > 0;

  // Anchor the axis to the full selected window, not just the data extent.
  const domain: [number, number] = [timeRange.start.getTime(), timeRange.end.getTime()];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-heading-md">Throughput</h3>
        <div className="flex items-center gap-1">
          <Select
            items={TIME_RANGES}
            onValueChange={(v) => setSelectedTimeRange(v as TimeRange)}
            value={selectedTimeRange}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {TIME_RANGES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <RefreshButton loading={isFetching} onClick={handleRefresh} />
        </div>
      </div>
      <ThroughputContent
        chartData={chartData}
        domain={domain}
        hasData={hasData}
        id={id}
        isError={isError}
        isLoading={isLoading}
        onRetry={handleRefresh}
      />
    </section>
  );
};
