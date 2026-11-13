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

import { Button, type ButtonProps } from 'components/redpanda-ui/components/button';
import { DropdownMenuItem, DropdownMenuShortcut } from 'components/redpanda-ui/components/dropdown-menu';
import { DisabledReasonTooltip } from 'components/ui/disabled-reason-tooltip';
import type { ComponentProps } from 'react';

import { type FencedAction, useClusterFenceGuard } from './use-cluster-fence-guard';

/** A Button the fence disables while it rejects `action`, with the reason in a tooltip. */
export const FenceGuardedButton = ({
  action,
  topic,
  disabled,
  ...props
}: ButtonProps & { action: FencedAction; topic?: string }) => {
  const reason = useClusterFenceGuard().reasonFor(action, topic);
  return (
    <DisabledReasonTooltip reason={reason}>
      <Button disabled={disabled || Boolean(reason)} {...props} />
    </DisabledReasonTooltip>
  );
};

/**
 * A menu item the fence disables while it rejects `action`. A disabled item takes no pointer events,
 * so a trailing hint explains it instead of a tooltip; screen readers get the whole reason. Another
 * reason to disable it (`disabled`) wins, and shows no hint.
 */
export const FenceGuardedMenuItem = ({
  action,
  topic,
  disabled,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuItem> & { action: FencedAction; topic?: string }) => {
  const fenceReason = useClusterFenceGuard().reasonFor(action, topic);
  const reason = disabled ? undefined : fenceReason;
  return (
    <DropdownMenuItem disabled={disabled || Boolean(reason)} {...props}>
      {children}
      {reason ? (
        <DropdownMenuShortcut>
          <span aria-hidden="true">Fenced</span>
          <span className="sr-only">{reason}</span>
        </DropdownMenuShortcut>
      ) : null}
    </DropdownMenuItem>
  );
};
