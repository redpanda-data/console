import { cva } from 'class-variance-authority';
import React from 'react';

import { Badge } from './badge';
import { Spinner } from './spinner';
import { StatusDot } from './status-dot';
import { cn, type DotSize, type SemanticVariant, type SharedProps } from '../lib/utils';

export type StatusBadgeVariant = SemanticVariant | 'starting' | 'stopping';
export type StatusBadgeSize = 'sm' | 'md' | 'lg';

const DOT_SIZE: Record<StatusBadgeSize, DotSize> = {
  sm: 'xs',
  md: 'sm',
  lg: 'md',
};

const SPINNER_SIZE: Record<StatusBadgeSize, string> = {
  sm: '!size-3',
  md: '!size-4',
  lg: '!size-5',
};

const SPINNER_COLOR: Record<'starting' | 'stopping', string> = {
  starting: 'text-success',
  stopping: 'text-destructive',
};

const DEFAULT_LABEL: Record<StatusBadgeVariant, string> = {
  success: 'Running',
  info: 'Pending',
  warning: 'Warning',
  error: 'Error',
  disabled: 'Stopped',
  starting: 'Starting',
  stopping: 'Stopping',
};

const badgeSizeStyles = cva('rounded-full', {
  variants: {
    size: {
      sm: 'h-6 gap-2 px-3',
      md: 'h-8 gap-3 px-4',
      lg: 'h-10 gap-3.5 px-5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

function StatusBadge({
  variant = 'info',
  pulsing = false,
  size,
  className,
  testId,
  children,
  ...props
}: React.ComponentProps<'span'> &
  SharedProps & {
    variant?: StatusBadgeVariant;
    pulsing?: boolean;
    size?: StatusBadgeSize;
  }) {
  const isTransitioning = variant === 'starting' || variant === 'stopping';
  const badgeSize = size ?? 'md';
  const label = children ?? DEFAULT_LABEL[variant];

  const icon = isTransitioning ? (
    <span>
      <Spinner className={cn(SPINNER_SIZE[badgeSize], SPINNER_COLOR[variant])} />
    </span>
  ) : (
    <StatusDot pulsing={pulsing} size={DOT_SIZE[badgeSize]} variant={variant} />
  );

  return (
    <Badge
      className={cn(badgeSizeStyles({ size }), className)}
      data-slot="status-badge"
      data-testid={testId}
      icon={icon}
      size={size}
      variant="secondary-inverted"
      {...props}
    >
      {label}
    </Badge>
  );
}

export { StatusBadge };
