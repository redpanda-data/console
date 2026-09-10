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

import { SkipIcon } from 'components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';

export function renderEmptyIcon(tooltipText?: string) {
  const text = tooltipText || 'Empty';
  return (
    // Chakra's `openDelay={1}` was effectively instant; the Registry default is Base UI's, so it is set here.
    <Tooltip delayDuration={0}>
      <TooltipTrigger
        render={
          <span className="ml-0.5 opacity-[0.66]">
            <SkipIcon />
          </span>
        }
      />
      <TooltipContent side="top">{text}</TooltipContent>
    </Tooltip>
  );
}
