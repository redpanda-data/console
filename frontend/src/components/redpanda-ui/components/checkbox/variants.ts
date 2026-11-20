// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const checkboxVariants = cva(
  'peer flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border transition-colors outline-none hover:not-disabled:not-data-[state=checked]:not-data-[state=indeterminate]:!border-input-hover hover:not-disabled:not-data-[state=checked]:not-data-[state=indeterminate]:bg-accent focus-visible:!border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:!border-destructive aria-invalid:ring-invalid motion-reduce:transition-none',
  {
    variants: {
      variant: {
        primary:
          '!border-input data-[state=checked]:!border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:!border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        secondary:
          '!border-input data-[state=checked]:!border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground data-[state=indeterminate]:!border-secondary data-[state=indeterminate]:bg-secondary data-[state=indeterminate]:text-secondary-foreground',
        outline:
          '!border-input data-[state=checked]:!border-foreground data-[state=checked]:bg-transparent data-[state=checked]:text-foreground data-[state=indeterminate]:!border-foreground data-[state=indeterminate]:bg-transparent data-[state=indeterminate]:text-foreground',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  }
);
