// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const bannerVariants = cva(
  'sticky top-0 z-40 flex w-full flex-row items-center justify-between gap-4 px-4 text-left text-body font-medium selection:bg-selection selection:text-selection-foreground',
  {
    variants: {
      variant: {
        secondary: 'bg-secondary text-secondary-foreground',
        brand: 'bg-brand text-brand-foreground',
        muted: 'bg-surface-subtle text-subtle',
        primary: 'bg-primary text-primary-foreground',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  }
);
