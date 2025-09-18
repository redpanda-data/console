import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn } from '../lib/utils';

const kbdVariants = cva('inline-flex items-center justify-center font-mono rounded-md', {
  variants: {
    variant: {
      default: 'bg-accent border border-border text-accent-foreground',
      outline: 'text-accent-foreground border border-input',
    },
    size: {
      md: 'h-7 min-w-7 px-1.5 text-xs [&_svg]:size-3.5',
      sm: 'h-6 min-w-6 px-1 text-[0.75rem] leading-[0.75rem] [&_svg]:size-3',
      xs: 'h-5 min-w-5 px-1 text-[0.6875rem] leading-[0.75rem] [&_svg]:size-3',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'md',
  },
});

function Kbd({
  className,
  variant,
  size,
  testId,
  ...props
}: React.ComponentProps<'kbd'> & VariantProps<typeof kbdVariants> & { testId?: string }) {
  return (
    <kbd data-slot="kbd" data-testid={testId} className={cn(kbdVariants({ variant, size }), className)} {...props} />
  );
}

export { Kbd, kbdVariants };
