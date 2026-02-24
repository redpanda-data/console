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
import type { FC } from 'react';
import { useMemo } from 'react';
import { useExecuteRangeQuery } from 'react-query/api/observability';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { CHART_COLORS, transformTimeSeriesData } from './utils/chart-data';
import { formatWithUnit } from '../../../utils/unit';
import { Alert, AlertDescription } from '../../redpanda-ui/components/alert';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '../../redpanda-ui/components/chart';
import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Heading } from '../../redpanda-ui/components/typography';

type MetricChartProps = {
  queryName: string;
  timeRange: {
    start: Date;
    end: Date;
  };
};

export const MetricChart: FC<MetricChartProps> = ({ queryName, timeRange }) => {
  const { data, isLoading, isError } = useExecuteRangeQuery({
    queryName,
    params: {
      start: timestampFromMs(timeRange.start.getTime()),
      end: timestampFromMs(timeRange.end.getTime()),
      filters: {},
    },
  });

  // Transform the time series data into chart format
  const chartData = useMemo(() => transformTimeSeriesData(data?.results || []), [data]);

  // Extract series names for creating lines
  const seriesNames = useMemo(() => {
    if (!data?.results) {
      return [];
    }
    return data.results
      .map((series) => series.name || 'value')
      .filter((name, index, self) => self.indexOf(name) === index);
  }, [data]);

  // Chart configuration
  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};

    for (let i = 0; i < seriesNames.length; i++) {
      config[seriesNames[i]] = {
        label: seriesNames[i],
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    }

    return config;
  }, [seriesNames]);

  if (isLoading) {
    return (
      <div className="rounded-md border border-gray-200 p-4">
        <Skeleton className="mt-2 h-[200px]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-gray-200 p-4">
        <Alert className="mt-2" variant="warning">
          <AlertDescription>Failed to load data for this metric</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 p-4">
        {data.metadata?.description ? (
          <Heading className="mb-4" level={4}>
            {data.metadata.description}
          </Heading>
        ) : null}
        <Alert className="mt-2" variant="info">
          <AlertDescription>No data available for this time range</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 p-4">
      {data.metadata?.description ? (
        <Heading className="mb-4" level={3}>
          {data.metadata.description}
        </Heading>
      ) : null}

      <ChartContainer className="mt-4 h-[250px] w-full" config={chartConfig}>
        <LineChart accessibilityLayer data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="timestamp"
            tickFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'UTC',
              });
            }}
            tickLine={false}
            tickMargin={10}
          />
          <YAxis
            axisLine={false}
            tickFormatter={(value) => formatWithUnit(value, data.metadata?.unit)}
            tickLine={false}
            width={80}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-[200px]"
                formatter={(value, name, item) => {
                  const indicatorColor = item.payload.fill || item.color;
                  const formattedValue = typeof value === 'number' ? formatWithUnit(value, data.metadata?.unit) : value;
                  return (
                    <div className="flex w-full items-center gap-3">
                      <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: indicatorColor }} />
                      <span className="text-muted-foreground">{name}</span>
                      <span className="ml-auto font-medium font-mono tabular-nums">{formattedValue}</span>
                    </div>
                  );
                }}
                hideLabel={false}
                labelFormatter={(_value, payload) => {
                  const timestamp = payload?.[0]?.payload?.timestamp;
                  if (!timestamp || typeof timestamp !== 'number') {
                    return '';
                  }
                  const date = new Date(timestamp);
                  if (!date.getTime()) {
                    return '';
                  }
                  return date.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                    timeZoneName: 'short',
                  });
                }}
              />
            }
          />
          {seriesNames.map((seriesName) => (
            <Line
              dataKey={seriesName}
              dot={false}
              key={seriesName}
              stroke={chartConfig[seriesName]?.color}
              strokeWidth={2}
              type="linear"
            />
          ))}
          <ChartLegend content={<ChartLegendContent />} />
        </LineChart>
      </ChartContainer>
    </div>
  );
};
