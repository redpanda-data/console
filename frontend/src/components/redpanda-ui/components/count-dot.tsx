import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import {
  cn,
  type DotSize,
  dotColorVariants,
  dotStackedVariants,
  type SharedProps,
  type StackableProps,
} from '../lib/utils';

export type CountDotSize = Exclude<DotSize, 'xxs' | 'xs'>;

const countDotSizeVariants = cva('', {
  variants: {
    size: {
      sm: 'h-4 min-w-4 px-0.5 text-[10px]',
      md: 'h-5 min-w-5 px-1 text-xs',
      lg: 'h-6 min-w-6 px-1.5 text-sm',
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
  VariantProps<typeof dotColorVariants> & {
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
        'inline-flex items-center justify-center rounded-full font-medium text-inverse leading-none',
        dotColorVariants({ variant }),
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
