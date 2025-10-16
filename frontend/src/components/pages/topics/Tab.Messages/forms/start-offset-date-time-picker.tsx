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
import { Component } from 'react';

import { uiState } from '../../../../../state/ui-state';

@observer
export class StartOffsetDateTimePicker extends Component<Record<string, never>> {
  constructor(p: Record<string, never>) {
    super(p);
    const searchParams = uiState.topicSettings.searchParams;
    if (!searchParams.startTimestampWasSetByUser) {
      // so far, the user did not change the startTimestamp, so we set it to 'now'
      searchParams.startTimestamp = Date.now();
    }
  }

  render() {
    const searchParams = uiState.topicSettings.searchParams;
    // new Date().getTimezoneOffset()

    return (
      <DateTimeInput
        onChange={(value) => {
          searchParams.startTimestamp = value;
          searchParams.startTimestampWasSetByUser = true;
        }}
        value={searchParams.startTimestamp}
      />
    );
  }
}
