// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const separatorVariants = cva('shrink-0', {
  variants: {
    variant: {
      default: 'bg-border',
      subtle: 'bg-border-subtle',
      strong: 'bg-border-strong',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});
