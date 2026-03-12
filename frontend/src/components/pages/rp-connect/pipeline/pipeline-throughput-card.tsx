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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Text } from 'components/redpanda-ui/components/typography';
import { ChartSkeleton } from 'components/ui/chart-skeleton';
import { TimerReset } from 'lucide-react';
import type { FC } from 'react';
import { useId, useMemo, useState } from 'react';
import { useExecuteRangeQuery, useListQueries } from 'react-query/api/observability';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { formatChartTimestamp, formatTooltipLabel, mergeTimeSeries } from 'utils/pipeline-throughput.utils';
import { calculateTimeRange, getTimeRanges, type TimeRange } from 'utils/time-range';

const TIME_RANGES = getTimeRanges(24 * 60 * 60 * 1000);

const chartConfig = {
  ingress: { label: 'Ingress', color: 'var(--color-primary)' },
  egress: { label: 'Egress', color: 'var(--color-secondary)' },
} satisfies ChartConfig;

type PipelineThroughputCardProps = {
  pipelineId: string;
};

export const PipelineThroughputCard: FC<PipelineThroughputCardProps> = ({ pipelineId }) => {
  const id = useId();
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('1h');

  const { data: queriesData, isLoading: isLoadingQueries } = useListQueries({
    filter: {
      tags: {
        component: 'redpanda-connect',
      },
    },
  });

  const hasInputQuery = queriesData?.queries?.some((q) => q.name === 'connect_input_received') ?? false;
  const hasOutputQuery = queriesData?.queries?.some((q) => q.name === 'connect_output_sent') ?? false;

  const timeRange = calculateTimeRange(selectedTimeRange);
  const timeParams = {
    start: timestampFromMs(timeRange.start.getTime()),
    end: timestampFromMs(timeRange.end.getTime()),
  };

  const { data: ingressData, isLoading: isLoadingIngress } = useExecuteRangeQuery(
    {
      queryName: 'connect_input_received',
      params: { ...timeParams, filters: { pipeline_id: pipelineId } },
    },
    { enabled: hasInputQuery }
  );

  const { data: egressData, isLoading: isLoadingEgress } = useExecuteRangeQuery(
    {
      queryName: 'connect_output_sent',
      params: { ...timeParams, filters: { pipeline_id: pipelineId } },
    },
    { enabled: hasOutputQuery }
  );

  const chartData = useMemo(
    () => mergeTimeSeries(ingressData?.results ?? [], egressData?.results ?? []),
    [ingressData, egressData]
  );

  const isLoading = isLoadingQueries || isLoadingIngress || isLoadingEgress;
  const hasData = chartData.length > 0;

  return (
    <Card size="full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Throughput</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <TimerReset className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {TIME_RANGES.map((option) => (
                <DropdownMenuCheckboxItem
                  checked={option.value === selectedTimeRange}
                  key={option.value}
                  onCheckedChange={() => setSelectedTimeRange(option.value)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="mt-4">
        {isLoading ? <ChartSkeleton className="h-40 w-full" variant="area" /> : null}
        {isLoading || hasData ? null : <Text className="text-muted-foreground">Throughput metrics not available</Text>}
        {!isLoading && hasData ? (
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
        ) : null}
      </CardContent>
    </Card>
  );
};
