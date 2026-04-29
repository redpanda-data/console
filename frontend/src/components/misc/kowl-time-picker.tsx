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

import { Box } from '@redpanda-data/ui';
import { DateTimeInput } from 'components/ui/date-time-input';
import { useState } from 'react';

export function KowlTimePicker(props: { valueUtcMs: number; onChange: (utcMs: number) => void; disabled?: boolean }) {
  const [timestampUtcMs, setTimestampUtcMs] = useState(props.valueUtcMs);

  return (
    <Box maxW={300}>
      <DateTimeInput
        disabled={props.disabled}
        onChange={(value) => {
          setTimestampUtcMs(value);
          props.onChange(value);
        }}
        value={timestampUtcMs}
      />
    </Box>
  );
}
