import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import { cn, type DotSize, dotColorVariants, type SharedProps, type StackableProps } from '../lib/utils';
import { statusDotSizeVariants } from './status-dot/variants';

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

// A shadow ring preserves the halo's footprint and center when dots overlap.
const statusDotStackedVariants = cva('ring-background', {
  variants: {
    size: {
      xxs: 'ring-1',
      xs: 'ring-2',
      sm: 'ring-1',
      md: 'ring-[1.5px]',
      lg: 'ring-2',
    },
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
    pulsing?: boolean | undefined;
    size?: DotSize | undefined;
  }) {
  return (
    <span
      // `w-fit` so the wrapper keeps the ring's width wherever it is placed: the core is
      // centred on the wrapper, so a stretched grid or flex item pulls the two apart.
      className={cn(
        'relative inline-flex w-fit shrink-0 rounded-full',
        stacked && statusDotStackedVariants({ size }),
        className
      )}
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
          'absolute top-1/2 left-1/2 -translate-1/2 rounded-full',
          dotColorVariants({ variant })
        )}
      >
        {children}
      </span>
    </span>
  );
}

export { StatusDot };
