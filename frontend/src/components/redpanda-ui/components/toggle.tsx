'use client';

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const toggleVariants = cva(
  "focus-visible:!border-ring aria-invalid:!border-destructive inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-body outline-none transition-[color,background-color,border-color,box-shadow] hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-accent-pressed disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-invalid data-[pressed]:bg-accent data-[pressed]:text-accent-foreground motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          '!border-input hover:!border-input-hover border bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        sm: 'h-8 min-w-8 px-1.5',
        md: 'h-9 min-w-9 px-2',
        lg: 'h-10 min-w-10 px-2.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

type ToggleProps = React.ComponentProps<typeof TogglePrimitive> & VariantProps<typeof toggleVariants> & SharedProps;

function Toggle({ className, variant, size, testId, ...props }: ToggleProps) {
  return (
    <TogglePrimitive
      className={cn(toggleVariants({ variant, size, className }))}
      data-slot="toggle"
      data-testid={testId}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
