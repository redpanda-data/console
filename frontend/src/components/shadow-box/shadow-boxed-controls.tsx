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

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button, type ButtonProps } from 'components/redpanda-ui/components/button';
import { DropdownMenuItem, DropdownMenuShortcut } from 'components/redpanda-ui/components/dropdown-menu';
import { DisabledReasonTooltip } from 'components/ui/disabled-reason-tooltip';
import { TriangleAlertIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { type BoxedAction, useShadowBoxGuard } from './use-shadow-box-guard';

/** A Button the fence disables while it rejects `action`, with the reason in a tooltip. */
export const ShadowBoxedButton = ({
  action,
  topic,
  disabled,
  ...props
}: ButtonProps & { action: BoxedAction; topic?: string }) => {
  const reason = useShadowBoxGuard().reasonFor(action, topic);
  return (
    <DisabledReasonTooltip reason={reason}>
      <Button disabled={disabled || Boolean(reason)} {...props} />
    </DisabledReasonTooltip>
  );
};

/** For a form whose submit the fence would reject: says why up front. Renders nothing otherwise. */
export const ShadowBoxedAlert = ({ action, testId }: { action: BoxedAction; testId?: string }) => {
  const reason = useShadowBoxGuard().reasonFor(action);
  if (!reason) {
    return null;
  }
  return (
    <Alert icon={<TriangleAlertIcon />} testId={testId ?? 'shadow-boxed-alert'} variant="warning">
      <AlertDescription>{reason}</AlertDescription>
    </Alert>
  );
};

/**
 * A menu item the fence disables while it rejects `action`. A disabled item takes no pointer events,
 * so a trailing hint explains it instead of a tooltip; screen readers get the whole reason. Another
 * reason to disable it (`disabled`) wins, and shows no hint.
 */
export const ShadowBoxedMenuItem = ({
  action,
  topic,
  disabled,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuItem> & { action: BoxedAction; topic?: string }) => {
  const fenceReason = useShadowBoxGuard().reasonFor(action, topic);
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
