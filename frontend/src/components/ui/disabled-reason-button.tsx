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

import { Button, type ButtonProps } from 'components/redpanda-ui/components/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { ReactNode } from 'react';

type DisabledReasonButtonProps = Pick<ButtonProps, 'variant' | 'size' | 'className'> & {
  reason?: string;
  testId?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  children: ReactNode;
  iconOnly?: boolean;
};

/**
 * Renders a button that is disabled with an explanatory tooltip when `reason` is set.
 * For `iconOnly` (table/heading action) buttons the disabled state renders as a `<span>`
 * (matching the legacy IconButton behavior the tests rely on); otherwise a disabled Button.
 */
export const DisabledReasonButton = ({
  reason,
  testId,
  onClick,
  children,
  variant = 'ghost',
  size = 'icon-sm',
  iconOnly = false,
  className,
}: DisabledReasonButtonProps) => {
  if (!reason) {
    return (
      <Button className={className} data-testid={testId} onClick={onClick} size={size} variant={variant}>
        {children}
      </Button>
    );
  }

  // Use a hoverable element (span / aria-disabled button) rather than a real `disabled`
  // button — disabled elements don't emit pointer events, so the tooltip would never show.
  const trigger = iconOnly ? (
    <span
      className={cn(
        'inline-flex h-8 w-8 cursor-not-allowed items-center justify-center text-muted-foreground opacity-50',
        className
      )}
      data-testid={testId}
    >
      {children}
    </span>
  ) : (
    <Button
      aria-disabled
      className={cn('cursor-not-allowed opacity-50', className)}
      data-testid={testId}
      onClick={(e) => e.preventDefault()}
      size={size}
      variant={variant}
    >
      {children}
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={trigger} />
        <TooltipContent role="tooltip">{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
