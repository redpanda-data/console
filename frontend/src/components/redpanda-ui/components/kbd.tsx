import type { VariantProps } from 'class-variance-authority';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';
import { kbdVariants } from './kbd/variants';

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

export { Kbd, KbdGroup };
