// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const skeletonVariants = cva('animate-pulse bg-accent motion-reduce:animate-none', {
  variants: {
    variant: {
      rounded: 'rounded-md',
      circle: 'rounded-full',
      text: 'h-4 rounded-md',
      heading: 'h-6 rounded-md',
      avatar: 'aspect-square rounded-full',
      button: 'h-9 rounded-md',
      card: 'rounded-lg',
    },
    size: {
      xs: 'h-2',
      sm: 'h-4',
      md: 'h-6',
      lg: 'h-8',
      xl: 'h-12',
    },
    width: {
      xs: 'w-16',
      sm: 'w-24',
      md: 'w-48',
      lg: 'w-64',
      xl: 'w-80',
      full: 'w-full',
      fit: 'w-fit',
    },
  },
  defaultVariants: {
    variant: 'rounded',
    size: 'md',
    width: 'md',
  },
});
