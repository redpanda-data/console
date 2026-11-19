// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

/** The count badge owns its stacking halo; its three sizes match CountDotSize. */
export const countDotStackedVariants = cva('!border-background', {
  variants: {
    size: {
      sm: 'border',
      md: 'border-[1.5px]',
      lg: 'border-2',
    },
  },
  defaultVariants: { size: 'md' },
});

export const countDotSizeVariants = cva('', {
  variants: {
    size: {
      sm: 'h-4 min-w-4 px-0.5 text-2xs',
      md: 'h-5 min-w-5 px-1 text-body-sm',
      lg: 'h-6 min-w-6 px-1.5 text-body',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});
