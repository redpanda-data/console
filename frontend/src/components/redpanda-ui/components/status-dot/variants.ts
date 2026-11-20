// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const statusDotSizeVariants = cva('', {
  variants: {
    size: {
      xxs: 'size-2',
      xs: 'size-3',
      sm: 'size-4',
      md: 'size-5',
      lg: 'size-6',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});
