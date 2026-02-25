import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type DotSize, dotColorVariants, type SharedProps, type StackableProps } from '../lib/utils';

const statusDotSizeVariants = cva('', {
  variants: {
    size: {
      xxs: 'size-2',
      xs: 'size-3',
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-6',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const statusDotCenterSizeVariants = cva('', {
  variants: {
    size: {
      xxs: 'size-1',
      xs: 'size-2',
      sm: 'size-2.5',
      md: 'size-3',
      lg: 'size-4',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

function StatusDot({
  variant,
  size = 'md',
  pulsing = false,
  stacked = false,
  className,
  testId,
  children,
  ...props
}: React.ComponentProps<'span'> &
  SharedProps &
  StackableProps &
  VariantProps<typeof dotColorVariants> & {
    pulsing?: boolean;
    size?: DotSize;
  }) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 rounded-full', className)}
      data-slot="status-dot"
      data-testid={testId}
      {...props}
    >
      <span
        className={cn(
          'rounded-full opacity-50',
          dotColorVariants({ variant }),
          statusDotSizeVariants({ size }),
          pulsing && 'animate-ping'
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          statusDotCenterSizeVariants({ size }),
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
          dotColorVariants({ variant })
        )}
      >
        {children}
      </span>
    </span>
  );
}

export { StatusDot, statusDotSizeVariants };
