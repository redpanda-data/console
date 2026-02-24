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

import { DateTimeInput } from '@redpanda-data/ui';
import { useEffect, useRef, useState } from 'react';

import { useTopicSettingsStore } from '../../../../../stores/topic-settings-store';

type StartOffsetDateTimePickerProps = {
  topicName: string;
  value: number;
  onChange: (value: number) => void;
};

export const StartOffsetDateTimePicker = ({ topicName, value, onChange }: StartOffsetDateTimePickerProps) => {
  const getSearchParams = useTopicSettingsStore((s) => s.getSearchParams);
  const searchParams = getSearchParams(topicName);

  // Use ref to avoid onChange in useEffect dependencies (it changes every render)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stable fallback timestamp to avoid Date.now() changes causing re-renders
  const [initialTimestamp] = useState(() => Date.now());

  // Initialize timestamp on mount if not set by user
  useEffect(() => {
    if (!searchParams?.startTimestampWasSetByUser && value === -1) {
      // so far, the user did not change the startTimestamp, so we set it to 'now'
      onChangeRef.current(Date.now());
    }
  }, [searchParams?.startTimestampWasSetByUser, value]);

  return (
    <div data-testid="start-timestamp-input">
      <DateTimeInput onChange={onChange} value={value === -1 ? initialTimestamp : value} />
    </div>
  );
};
