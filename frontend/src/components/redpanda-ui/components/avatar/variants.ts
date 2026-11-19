// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const avatarVariants = cva('group/avatar relative flex shrink-0 select-none', {
  variants: {
    frame: {
      none: '',
      group: 'border-3 border-background',
    },
    shape: {
      round: 'rounded-full',
      square: 'rounded-lg',
    },
    size: {
      sm: 'size-6',
      md: 'size-8',
      lg: 'size-10',
    },
  },
  defaultVariants: {
    frame: 'none',
    shape: 'round',
    size: 'md',
  },
});

export const avatarFallbackVariants = cva(
  'flex size-full items-center justify-center rounded-[inherit] text-body group-data-[size=sm]/avatar:text-body-sm',
  {
    variants: {
      tone: {
        default: 'bg-surface-subtle',
        primary: 'bg-primary text-primary-foreground',
        success: 'bg-surface-success text-success-foreground',
        brand: 'bg-brand text-brand-foreground',
      },
    },
    defaultVariants: { tone: 'default' },
  }
);
