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

import { DateTimeInput } from 'components/ui/date-time-input';
import { useEffect, useRef, useState } from 'react';

import { useTopicSettingsStore } from '../../../../../stores/topic-settings-store';

type StartOffsetDateTimePickerProps = {
  topicName: string;
  value: number;
  onChange: (value: number) => void;
  /** Render the calendar/time panel inline instead of behind a click-to-open popup — for callers already inside their own popup. */
  inline?: boolean;
};

export const StartOffsetDateTimePicker = ({ topicName, value, onChange, inline }: StartOffsetDateTimePickerProps) => {
  const getSearchParams = useTopicSettingsStore((s) => s.getSearchParams);
  const searchParams = getSearchParams(topicName);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // WARNING: Keep the fallback timestamp stable; recalculating it every render can spuriously reset the selected time.
  const [initialTimestamp] = useState(() => Date.now());

  useEffect(() => {
    if (!searchParams?.startTimestampWasSetByUser && value === -1) {
      onChangeRef.current(Date.now());
    }
  }, [searchParams?.startTimestampWasSetByUser, value]);

  return (
    <div data-testid="start-timestamp-input">
      <DateTimeInput inline={inline} onChange={onChange} value={value === -1 ? initialTimestamp : value} />
    </div>
  );
};
