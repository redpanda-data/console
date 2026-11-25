// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md text-body font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus-visible:!border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent-pressed disabled:pointer-events-none disabled:opacity-50 aria-invalid:!border-destructive aria-invalid:ring-invalid data-[pressed]:bg-accent data-[pressed]:text-accent-foreground motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border !border-input bg-transparent shadow-xs hover:!border-input-hover hover:bg-accent hover:text-accent-foreground',
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
