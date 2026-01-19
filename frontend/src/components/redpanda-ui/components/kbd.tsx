import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const kbdVariants = cva('inline-flex items-center justify-center rounded-md font-mono', {
  variants: {
    variant: {
      filled: 'border border-border bg-accent text-accent-foreground',
      outline: 'border border-input text-accent-foreground',
    },
    size: {
      md: 'h-7 min-w-7 px-1.5 text-xs [&_svg]:size-3.5',
      sm: 'h-6 min-w-6 px-1 text-[0.75rem] leading-[0.75rem] [&_svg]:size-3',
      xs: 'h-5 min-w-5 px-1 text-[0.6875rem] leading-[0.75rem] [&_svg]:size-3',
    },
  },
  defaultVariants: {
    variant: 'filled',
    size: 'md',
  },
});

function Kbd({
  className,
  variant,
  size,
  testId,
  ...props
}: React.ComponentProps<'kbd'> & VariantProps<typeof kbdVariants> & SharedProps) {
  return (
    <kbd className={cn(kbdVariants({ variant, size }), className)} data-slot="kbd" data-testid={testId} {...props} />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <kbd className={cn('inline-flex items-center gap-1', className)} data-slot="kbd-group" {...props} />;
}

export { Kbd, KbdGroup, kbdVariants };
