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
import { useCallback, useMemo, useState } from 'react';
import { useExecuteRangeQuery, useListQueries } from 'react-query/api/observability';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { calculateTimeRange, getTimeRanges, type TimeRange } from 'utils/time-range';

const TIME_RANGES = getTimeRanges(24 * 60 * 60 * 1000);

const chartConfig = {
  ingress: { label: 'Ingress', color: 'var(--color-primary)' },
  egress: { label: 'Egress', color: 'var(--color-secondary)' },
} satisfies ChartConfig;

type PipelineThroughputCardProps = {
  pipelineId: string;
};

type TimeSeriesResult = { values: { timestamp?: { seconds: bigint }; value?: number }[]; name?: string };
type MergedPoint = { timestamp: number; ingress: number; egress: number };

function addSeriesToMap(map: Map<number, MergedPoint>, results: TimeSeriesResult[], key: 'ingress' | 'egress'): void {
  for (const series of results) {
    for (const point of series.values) {
      if (!point.timestamp || point.value === undefined) {
        continue;
      }
      const ts = Number(point.timestamp.seconds) * 1000;
      const entry = map.get(ts) ?? { timestamp: ts, ingress: 0, egress: 0 };
      entry[key] = point.value;
      map.set(ts, entry);
    }
  }
}

function mergeTimeSeries(ingressResults: TimeSeriesResult[], egressResults: TimeSeriesResult[]): MergedPoint[] {
  const map = new Map<number, MergedPoint>();
  addSeriesToMap(map, ingressResults, 'ingress');
  addSeriesToMap(map, egressResults, 'egress');
  return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export const PipelineThroughputCard: FC<PipelineThroughputCardProps> = ({ pipelineId }) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>('1h');

  const { data: queriesData, isLoading: isLoadingQueries } = useListQueries({
    filter: {
      tags: {
        component: 'redpanda-connect',
      },
    },
  });

  const hasInputQuery = useMemo(
    () => queriesData?.queries?.some((q) => q.name === 'connect_input_received') ?? false,
    [queriesData]
  );
  const hasOutputQuery = useMemo(
    () => queriesData?.queries?.some((q) => q.name === 'connect_output_sent') ?? false,
    [queriesData]
  );

  const timeRange = useMemo(() => calculateTimeRange(selectedTimeRange), [selectedTimeRange]);

  const timeParams = useMemo(
    () => ({
      start: timestampFromMs(timeRange.start.getTime()),
      end: timestampFromMs(timeRange.end.getTime()),
    }),
    [timeRange]
  );

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

  const handleTimeRangeChange = useCallback((value: TimeRange) => {
    setSelectedTimeRange(value);
  }, []);

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
                  onCheckedChange={() => handleTimeRangeChange(option.value)}
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
                <linearGradient id="fillIngress" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-ingress)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-ingress)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="fillEgress" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-egress)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-egress)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="timestamp"
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                }}
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
                      return new Date(ts).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                    }}
                  />
                }
              />
              <Area
                dataKey="ingress"
                fill="url(#fillIngress)"
                stroke="var(--color-ingress)"
                strokeWidth={2}
                type="monotone"
              />
              <Area
                dataKey="egress"
                fill="url(#fillEgress)"
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
