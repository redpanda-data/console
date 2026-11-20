// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const dotGroupSpacingVariants = cva('inline-flex items-center', {
  variants: {
    size: {
      xxs: '-space-x-px',
      xs: '-space-x-px',
      sm: '-space-x-px',
      md: '-space-x-0.5',
      lg: '-space-x-0.5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export const dotGroupPositionVariants = cva('absolute', {
  variants: {
    position: {
      top: 'top-0 left-1/2 -translate-1/2',
      'top-right': 'top-0 right-0 translate-x-1/3 -translate-y-1/2',
      'top-left': 'top-0 left-0 -translate-x-1/3 -translate-y-1/2',
      right: 'top-1/2 left-full -translate-y-1/2',
      'bottom-right': 'right-0 bottom-0 translate-x-1/3 translate-y-1/2',
      bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
      'bottom-left': 'bottom-0 left-0 -translate-x-1/3 translate-y-1/2',
      left: 'top-1/2 right-full -translate-y-1/2',
    },
  },
  defaultVariants: {
    position: 'top-right',
  },
});
