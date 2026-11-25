import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { cn, type DotSize, type SharedProps, type StackableProps } from '../lib/utils';
import { countDotSizeVariants, countDotStackedVariants } from './count-dot/variants';

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
    max?: number | undefined;
    size?: CountDotSize | undefined;
  }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full leading-none font-medium',
        countDotColorVariants({ variant }),
        countDotSizeVariants({ size }),
        stacked && countDotStackedVariants({ size }),
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

export { CountDot };
