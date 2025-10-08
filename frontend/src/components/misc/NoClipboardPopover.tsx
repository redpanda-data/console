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

import { Popover } from '@redpanda-data/ui';
import type { FunctionComponent, ReactElement } from 'react';

import { isClipboardAvailable } from '../../utils/featureDetection';

const popoverContent = (
  <>
    <p>Due to browser restrictions, the clipboard is not accessible on unsecure connections.</p>
    <p>Please make sure to run Redpanda Console with SSL enabled to use this feature.</p>
  </>
);

export const NoClipboardPopover: FunctionComponent<{
  children: ReactElement;
  placement?: 'left' | 'top';
}> = ({ children, placement = 'top' }) =>
  isClipboardAvailable ? (
    children
  ) : (
    <Popover content={popoverContent} placement={placement} title="Clipboard unavailable" trigger="hover">
      {children}
    </Popover>
  );
