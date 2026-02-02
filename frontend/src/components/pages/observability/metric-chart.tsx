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
import { Alert, AlertIcon, Box, Heading, Skeleton, Text } from '@redpanda-data/ui';
import type { ExecuteRangeQueryResponse } from 'protogen/redpanda/api/dataplane/v1alpha3/observability_pb';
import type { FC } from 'react';
import { useMemo } from 'react';
import { useExecuteRangeQuery } from 'react-query/api/observability';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '../../redpanda-ui/components/chart';

type MetricChartProps = {
  queryName: string;
  timeRange: {
    start: Date;
    end: Date;
  };
};

// Helper to add data point to timestamp map
function addDataPoint(
  timestampMap: Map<number, { timestamp: number; [key: string]: number }>,
  seriesName: string,
  point: { timestamp?: { seconds: bigint }; value?: number }
): void {
  if (!point.timestamp || point.value === undefined) {
    return;
  }

  // Convert seconds to milliseconds for JavaScript Date
  const ts = Number(point.timestamp.seconds) * 1000;

  if (!timestampMap.has(ts)) {
    timestampMap.set(ts, { timestamp: ts });
  }

  const entry = timestampMap.get(ts);
  if (entry) {
    entry[seriesName] = point.value;
  }
}

// Helper function to transform time series data into chart format
function transformTimeSeriesData(results: ExecuteRangeQueryResponse['results']): Array<{
  timestamp: number;
  [key: string]: number;
}> {
  if (!results || results.length === 0) {
    return [];
  }

  const timestampMap = new Map<number, { timestamp: number; [key: string]: number }>();

  for (const series of results) {
    const seriesName = series.name || 'value';
    for (const point of series.values) {
      addDataPoint(timestampMap, seriesName, point);
    }
  }

  return Array.from(timestampMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

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
    const colors = [
      'var(--color-chart-1)',
      'var(--color-chart-2)',
      'var(--color-chart-3)',
      'var(--color-chart-4)',
      'var(--color-chart-5)',
    ];

    for (let i = 0; i < seriesNames.length; i++) {
      config[seriesNames[i]] = {
        label: seriesNames[i],
        color: colors[i % colors.length],
      };
    }

    return config;
  }, [seriesNames]);

  if (isLoading) {
    return (
      <Box borderColor="gray.200" borderRadius="md" borderWidth="1px" p={4}>
        <Skeleton height="200px" mt={2} />
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box borderColor="gray.200" borderRadius="md" borderWidth="1px" p={4}>
        <Alert mt={2} status="warning">
          <AlertIcon />
          <Text fontSize="sm">Failed to load data for this metric</Text>
        </Alert>
      </Box>
    );
  }

  if (chartData.length === 0) {
    return (
      <Box borderColor="gray.200" borderRadius="md" borderWidth="1px" p={4}>
        {data.metadata?.description ? (
          <Heading mb={2} size="sm">
            {data.metadata.description}
          </Heading>
        ) : null}
        <Alert mt={2} status="info">
          <AlertIcon />
          <Text fontSize="sm">No data available for this time range</Text>
        </Alert>
      </Box>
    );
  }

  return (
    <Box borderColor="gray.200" borderRadius="md" borderWidth="1px" p={4}>
      {data.metadata?.description ? (
        <Heading mb={4} size="sm">
          {data.metadata.description}
        </Heading>
      ) : null}

      <ChartContainer className="h-[250px] w-full" config={chartConfig}>
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
            label={
              data.metadata?.unit
                ? {
                    value: data.metadata.unit,
                    angle: -90,
                    position: 'insideLeft',
                    style: { textAnchor: 'middle' },
                  }
                : undefined
            }
            tickFormatter={(value) => {
              // Format large numbers with K, M, B suffixes
              if (value >= 1_000_000_000) {
                return `${(value / 1_000_000_000).toFixed(1)}B`;
              }
              if (value >= 1_000_000) {
                return `${(value / 1_000_000).toFixed(1)}M`;
              }
              if (value >= 1000) {
                return `${(value / 1000).toFixed(1)}K`;
              }
              // Show decimals for small values
              if (value < 10) {
                return value.toFixed(2);
              }
              if (value < 100) {
                return value.toFixed(1);
              }
              return value.toFixed(0);
            }}
            tickLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                className="min-w-[200px]"
                formatter={(value, name, item) => {
                  const indicatorColor = item.payload.fill || item.color;
                  return (
                    <div className="flex w-full items-center gap-3">
                      <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: indicatorColor }} />
                      <span className="text-muted-foreground">{name}</span>
                      <span className="ml-auto font-medium font-mono tabular-nums">
                        {value?.toLocaleString()}
                        {data.metadata?.unit ? ` ${data.metadata.unit}` : ''}
                      </span>
                    </div>
                  );
                }}
                hideLabel={false}
                labelFormatter={(_value, payload) => {
                  // Get timestamp from payload data
                  const timestamp = payload?.[0]?.payload?.timestamp;
                  if (!timestamp) {
                    return '';
                  }
                  const ts = typeof timestamp === 'number' ? timestamp : Number(timestamp);
                  if (Number.isNaN(ts)) {
                    return '';
                  }
                  const date = new Date(ts);
                  if (Number.isNaN(date.getTime())) {
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
    </Box>
  );
};
