// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const statValueVariants = cva('leading-none', {
  variants: {
    size: {
      sm: 'text-body',
      md: 'text-body-lg',
      lg: 'text-2xl font-bold tracking-tighter',
    },
    tone: {
      default: 'text-foreground',
      muted: 'text-subtle',
      informative: 'text-informative',
      success: 'text-success',
      warning: 'text-warning',
      destructive: 'text-destructive',
    },
    mono: {
      true: 'font-mono tabular-nums',
      false: '',
    },
  },
  defaultVariants: {
    size: 'md',
    tone: 'default',
    mono: false,
  },
});

/**
 * Base establishes CSS subgrid row tracks and opts every child `[data-slot=stat]` into
 * `grid-rows-subgrid` spanning two rows. All labels in a row share one track height and all
 * values align, independent of label wrapping; `gap-y-0.5` keeps the label→value gap tight
 * regardless of the group's inter-cell `gap`.
 */
export const statGroupVariants = cva(
  'grid [&>[data-slot=stat]]:row-span-2 [&>[data-slot=stat]]:grid [&>[data-slot=stat]]:grid-rows-subgrid [&>[data-slot=stat]]:gap-y-0.5',
  {
    variants: {
      // Container sizes, not viewport breakpoints: a group in a card or a docs preview can be far
      // narrower than the viewport. Each step keeps a cell at roughly 135px or more.
      columns: {
        2: 'grid-cols-2',
        3: 'grid-cols-1 @md/stat-group:grid-cols-3',
        4: 'grid-cols-2 @2xl/stat-group:grid-cols-4',
        6: 'grid-cols-2 @2xl/stat-group:grid-cols-3 @4xl/stat-group:grid-cols-6',
      },
      gap: {
        sm: 'gap-3',
        md: 'gap-4',
        lg: 'gap-6',
      },
    },
    defaultVariants: {
      columns: 4,
      gap: 'md',
    },
  }
);
