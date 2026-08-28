import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type DotSize, dotStackedVariants, type SharedProps, type StackableProps } from '../lib/utils';

export type CountDotSize = Exclude<DotSize, 'xxs' | 'xs'>;

/**
 * A count carries a number, so it takes the `surface-<tone>` fill and that tone's own ink — the
 * pair `theme-contrast.test.ts` measures. StatusDot keeps `dotColorVariants`, whose `-strong`
 * indicator fills declare no ink because nothing writes on them (white on `success-strong` is
 * 3.25:1).
 */
const countDotColorVariants = cva('', {
  variants: {
    variant: {
      success: 'bg-surface-success text-success-foreground',
      informative: 'bg-surface-informative text-informative-foreground',
      warning: 'bg-surface-warning text-warning-foreground',
      destructive: 'bg-surface-destructive text-destructive-foreground',
      disabled: 'bg-surface-disabled text-disabled',
    },
  },
  defaultVariants: {
    variant: 'informative',
  },
});

const countDotSizeVariants = cva('', {
  variants: {
    size: {
      sm: 'h-4 min-w-4 px-0.5 text-2xs',
      md: 'h-5 min-w-5 px-1 text-body-sm',
      lg: 'h-6 min-w-6 px-1.5 text-body',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

function CountDot({
  count,
  max = 99,
  variant,
  size = 'md',
  stacked = false,
  className,
  testId,
  ...props
}: React.ComponentProps<'span'> &
  SharedProps &
  StackableProps &
  VariantProps<typeof countDotColorVariants> & {
    count: number;
    max?: number;
    size?: CountDotSize;
  }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium leading-none',
        countDotColorVariants({ variant }),
        countDotSizeVariants({ size }),
        stacked && dotStackedVariants({ size }),
        className
      )}
      data-slot="count-dot"
      data-testid={testId}
      {...props}
    >
      {count > max ? `${max}+` : String(count)}
    </span>
  );
}

export { CountDot, countDotSizeVariants };
