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
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from 'components/redpanda-ui/components/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';
import { ChartSkeleton } from 'components/ui/chart-skeleton';
import { RefreshCcw } from 'lucide-react';
import type { FC } from 'react';
import { useCallback, useId, useMemo, useState } from 'react';
import { useExecuteRangeQuery, useListQueries } from 'react-query/api/observability';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  formatChartTimestamp,
  formatTooltipLabel,
  type MergedPoint,
  mergeTimeSeries,
} from 'utils/pipeline-throughput.utils';
import { calculateTimeRange, getTimeRanges, type TimeRange } from 'utils/time-range';

const TIME_RANGES = getTimeRanges(24 * 60 * 60 * 1000);

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
};

const ThroughputContent: FC<ThroughputContentProps> = ({ isLoading, isError, hasData, chartData, id }) => {
  if (isLoading) {
    return <ChartSkeleton className="h-40 w-full" variant="area" />;
  }

  if (isError) {
    return (
      <Alert variant="warning">
        <AlertDescription>Failed to load throughput metrics</AlertDescription>
      </Alert>
    );
  }

  if (!hasData) {
    return <Text className="text-muted-foreground">Throughput metrics not available</Text>;
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
          tickFormatter={formatChartTimestamp}
          tickLine={false}
          tickMargin={8}
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

  const { data: queriesData, isLoading: isLoadingQueries } = useListQueries({
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
    setRefreshKey((prev) => prev + 1);
  }, []);

  const chartData = useMemo(
    () => mergeTimeSeries(ingressData?.results ?? [], egressData?.results ?? []),
    [ingressData, egressData]
  );

  // isPending stays true when enabled:false (query will never run), so only
  // treat enabled queries as "still loading" to avoid an infinite skeleton.
  const isLoading = isLoadingQueries || (hasInputQuery && isPendingIngress) || (hasOutputQuery && isPendingEgress);
  const isError = isErrorIngress || isErrorEgress;
  const isFetching = isFetchingIngress || isFetchingEgress;
  const hasData = chartData.length > 0;

  return (
    <Card size="full" variant="outlined">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Throughput</CardTitle>
          <div className="flex items-center gap-1">
            <Button disabled={isFetching} onClick={handleRefresh} size="icon" variant="ghost">
              <RefreshCcw className={isFetching ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
            <Select onValueChange={(v) => setSelectedTimeRange(v as TimeRange)} value={selectedTimeRange}>
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
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-4">
        <ThroughputContent chartData={chartData} hasData={hasData} id={id} isError={isError} isLoading={isLoading} />
      </CardContent>
    </Card>
  );
};
