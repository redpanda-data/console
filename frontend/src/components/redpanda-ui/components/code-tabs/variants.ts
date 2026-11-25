// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const codeTabsVariants = cva('flex w-full flex-col overflow-hidden rounded-xl border bg-card', {
  variants: {
    variant: {
      standard: '',
    },
  },
  defaultVariants: {
    variant: 'standard',
  },
});

export const codeTabsListVariants = cva(
  'relative flex h-10 w-full items-center justify-between border-b border-border bg-surface-subtle px-4 text-current',
  {
    variants: {
      variant: {
        standard: '',
      },
    },
    defaultVariants: {
      variant: 'standard',
    },
  }
);

export const codeTabsActiveVariants = cva(
  "rounded-none bg-transparent shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t-full after:bg-selected after:content-['']",
  {
    variants: {
      variant: {
        standard: '',
      },
    },
    defaultVariants: {
      variant: 'standard',
    },
  }
);

export const codeTabsContentVariants = cva(
  'flex w-full items-center overflow-auto p-4 text-body outline-none data-ending-style:hidden',
  {
    variants: {
      variant: {
        standard: '',
      },
    },
    defaultVariants: {
      variant: 'standard',
    },
  }
);
