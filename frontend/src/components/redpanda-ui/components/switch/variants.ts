// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const switchVariants = cva(
  'peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:!border-destructive aria-invalid:ring-invalid data-checked:not-data-disabled:bg-selected data-disabled:cursor-not-allowed data-disabled:bg-surface-disabled data-disabled:opacity-50 data-unchecked:not-data-disabled:bg-input data-unchecked:hover:not-data-disabled:bg-input-hover motion-reduce:transition-none',
  {
    variants: {
      size: {
        sm: 'h-3.5 w-6',
        md: 'h-[1.15rem] w-8',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);
