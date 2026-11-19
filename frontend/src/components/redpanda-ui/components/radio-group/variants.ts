// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const radioGroupVariants = cva('', {
  variants: {
    orientation: {
      vertical: 'grid',
      horizontal: 'flex flex-row flex-wrap',
    },
    variant: {
      standard: 'gap-2.5',
      attached: 'gap-0 -space-y-px rounded-md shadow-xs',
    },
  },
  defaultVariants: {
    orientation: 'vertical',
    variant: 'standard',
  },
});
