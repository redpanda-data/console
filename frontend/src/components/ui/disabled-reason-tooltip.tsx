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

import {
  Tooltip,
  TooltipContent,
  type TooltipContentProps,
  TooltipTrigger,
} from 'components/redpanda-ui/components/tooltip';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { ReactElement } from 'react';

type DisabledReasonTooltipProps = {
  reason?: string;
  side?: TooltipContentProps['side'];
  children: ReactElement;
};

/**
 * A disabled button gets no pointer events or focus, so while `reason` disables it a tooltip trigger
 * needs a span around it that takes both. The reason is also in the span's text, because a tooltip
 * isn't announced. Without a reason, the control is returned untouched.
 */
export const hoverableWhenDisabled = (
  reason: string | undefined,
  control: ReactElement,
  /** Layout the control has in its row, such as `ml-auto`, which the span then has to carry. */
  className?: string
): ReactElement =>
  reason ? (
    <span
      className={cn(
        'inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className
      )}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the only way for a keyboard to reach why the control is disabled
      tabIndex={0}
    >
      {control}
      <span className="sr-only">{reason}</span>
    </span>
  ) : (
    control
  );

/** Explains why the wrapped control is disabled. Without a reason, the control renders untouched. */
export const DisabledReasonTooltip = ({ reason, side, children }: DisabledReasonTooltipProps) => {
  if (!reason) {
    return children;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger render={hoverableWhenDisabled(reason, children)} />
      <TooltipContent side={side}>{reason}</TooltipContent>
    </Tooltip>
  );
};
