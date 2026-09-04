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

import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import type { FunctionComponent, ReactElement } from 'react';

import { isClipboardAvailable } from '../../utils/feature-detection';

const popoverContent = (
  <>
    <p className="font-semibold">Clipboard unavailable</p>
    <p>Due to browser restrictions, the clipboard is not accessible on unsecure connections.</p>
    <p>Run Redpanda Console with SSL enabled to use this feature.</p>
  </>
);

export const NoClipboardPopover: FunctionComponent<{
  children: ReactElement;
  placement?: 'left' | 'top';
}> = ({ children, placement = 'top' }) =>
  isClipboardAvailable ? (
    children
  ) : (
    // Hover-triggered and informational, so a Tooltip rather than a Popover.
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={placement}>{popoverContent}</TooltipContent>
    </Tooltip>
  );
