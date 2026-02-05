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

import type { FC } from 'react';
import { useMemo } from 'react';

import type { TimeRange } from './utils/time-range';
import { calculateTimeRange, formatTimeRangeDate, TIME_RANGE_OPTIONS } from './utils/time-range';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';

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
  const timeRange = useMemo(() => calculateTimeRange(selectedTimeRange), [selectedTimeRange, refreshKey]);

  const timeRangeDisplay = useMemo(
    () => ({
      start: formatTimeRangeDate(timeRange.start),
      end: formatTimeRangeDate(timeRange.end),
    }),
    [timeRange]
  );

  return (
    <div className="rounded-md border border-gray-200 p-4 shadow-sm">
      <div className="flex gap-6">
        <div>
          <div className="mb-1 text-gray-600 text-xs">TIME RANGE</div>
          <Select onValueChange={(value) => onTimeRangeChange(value as TimeRange)} value={selectedTimeRange}>
            <SelectTrigger className="h-8 w-[110px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-px bg-gray-300" />
        <div>
          <div className="mb-1 text-gray-600 text-xs">FROM</div>
          <div className="font-medium text-sm">{timeRangeDisplay.start}</div>
        </div>
        <div className="w-px bg-gray-300" />
        <div>
          <div className="mb-1 text-gray-600 text-xs">TO</div>
          <div className="font-medium text-sm">{timeRangeDisplay.end}</div>
        </div>
        <div className="w-px bg-gray-300" />
        <div>
          <div className="mb-1 text-gray-600 text-xs">TIMEZONE</div>
          <div className="font-medium text-sm">UTC</div>
        </div>
      </div>
    </div>
  );
};
