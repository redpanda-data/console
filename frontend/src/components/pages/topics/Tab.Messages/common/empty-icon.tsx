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

import { SkipIcon } from '@primer/octicons-react';
import { Tooltip } from '@redpanda-data/ui';

export function renderEmptyIcon(tooltipText?: string) {
  const text = tooltipText || 'Empty';
  return (
    <Tooltip hasArrow label={text} openDelay={1} placement="top">
      <span style={{ opacity: 0.66, marginLeft: '2px' }}>
        <SkipIcon />
      </span>
    </Tooltip>
  );
}
