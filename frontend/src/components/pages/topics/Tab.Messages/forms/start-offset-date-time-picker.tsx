/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { DateTimeInput } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useEffect } from 'react';

import { uiState } from '../../../../../state/ui-state';

export const StartOffsetDateTimePicker = observer(() => {
  // Initialize timestamp on mount if not set by user
  useEffect(() => {
    const searchParams = uiState.topicSettings.searchParams;
    if (!searchParams.startTimestampWasSetByUser) {
      // so far, the user did not change the startTimestamp, so we set it to 'now'
      searchParams.startTimestamp = Date.now();
    }
  }, []);

  const searchParams = uiState.topicSettings.searchParams;

  return (
    <DateTimeInput
      onChange={(value) => {
        searchParams.startTimestamp = value;
        searchParams.startTimestampWasSetByUser = true;
      }}
      value={searchParams.startTimestamp}
    />
  );
});
