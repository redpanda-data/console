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

import { Box, Flex, Text } from '@redpanda-data/ui';
import type { FC } from 'react';
import { useMemo } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';

export type TimeRange = '5m' | '15m' | '30m' | '1h' | '3h' | '6h';

const TIME_RANGE_MS: Record<TimeRange, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
};

export type TimeRangeDates = {
  start: Date;
  end: Date;
};

type ObservabilityToolbarProps = {
  selectedTimeRange: TimeRange;
  onTimeRangeChange: (timeRange: TimeRange) => void;
  refreshKey: number;
};

export const ObservabilityToolbar: FC<ObservabilityToolbarProps> = ({
  selectedTimeRange,
  onTimeRangeChange,
  refreshKey,
}) => {
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey triggers recalculation on refresh
  const timeRange = useMemo(() => {
    const now = new Date();
    const startTime = new Date(now.getTime() - TIME_RANGE_MS[selectedTimeRange]);

    return {
      start: startTime,
      end: now,
    };
  }, [selectedTimeRange, refreshKey]);

  const timeRangeDisplay = useMemo(() => {
    const formatDate = (date: Date) =>
      date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
      });

    return {
      start: formatDate(timeRange.start),
      end: formatDate(timeRange.end),
    };
  }, [timeRange]);

  return (
    <Box borderColor="gray.200" borderRadius="md" borderWidth="1px" boxShadow="sm" p={4}>
      <Flex gap={6}>
        <Box>
          <Text className="mb-1 text-gray-600 text-xs">TIME RANGE</Text>
          <Select onValueChange={(value) => onTimeRangeChange(value as TimeRange)} value={selectedTimeRange}>
            <SelectTrigger className="h-8 w-[110px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5m">Last 5m</SelectItem>
              <SelectItem value="15m">Last 15m</SelectItem>
              <SelectItem value="30m">Last 30m</SelectItem>
              <SelectItem value="1h">Last 1h</SelectItem>
              <SelectItem value="3h">Last 3h</SelectItem>
              <SelectItem value="6h">Last 6h</SelectItem>
            </SelectContent>
          </Select>
        </Box>
        <Box className="w-px bg-gray-300" />
        <Box>
          <Text className="mb-1 text-gray-600 text-xs">FROM</Text>
          <Text className="font-medium text-sm">{timeRangeDisplay.start}</Text>
        </Box>
        <Box className="w-px bg-gray-300" />
        <Box>
          <Text className="mb-1 text-gray-600 text-xs">TO</Text>
          <Text className="font-medium text-sm">{timeRangeDisplay.end}</Text>
        </Box>
        <Box className="w-px bg-gray-300" />
        <Box>
          <Text className="mb-1 text-gray-600 text-xs">TIMEZONE</Text>
          <Text className="font-medium text-sm">UTC</Text>
        </Box>
      </Flex>
    </Box>
  );
};

export function calculateTimeRange(selectedTimeRange: TimeRange): TimeRangeDates {
  const now = new Date();
  const startTime = new Date(now.getTime() - TIME_RANGE_MS[selectedTimeRange]);

  return {
    start: startTime,
    end: now,
  };
}
