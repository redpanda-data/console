// Copyright 2026 Redpanda Data, Inc.

import { cva } from 'class-variance-authority';

export const tableVariants = cva(
  'relative w-full min-w-0 overflow-x-auto rounded-lg border border-solid border-border bg-card p-0 shadow-elevated',
  {
    variants: {
      variant: {
        standard: '',
        striped:
          '[&>table>tbody>tr:nth-child(even):not(:hover):not([data-state=selected]):not(:has([aria-expanded=true]))]:bg-surface-recess [&>table>tbody>tr:nth-child(even):not(:hover):not([data-state=selected]):not(:has([aria-expanded=true]))]:[--table-row-wash:var(--color-surface-recess)]',
        simple: 'border-0 bg-transparent shadow-none',
        bordered: 'border-2',
        card: 'shadow-lg',
      },
      stickyHeader: {
        true: 'h-full overflow-auto focus-visible:ring-3 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset [&>table>thead]:sticky [&>table>thead]:top-0 [&>table>thead]:z-30 [&>table>thead]:bg-card [&>table>thead]:shadow-xs',
        false: '',
      },
      size: {
        sm: '[&_table]:text-body-sm',
        md: '[&_table]:text-body',
        lg: '[&_table]:text-body-lg',
      },
    },
    defaultVariants: {
      variant: 'standard',
      size: 'md',
    },
  }
);

export const tableHeadVariants = cva(
  'h-10 px-4 align-middle font-medium whitespace-nowrap text-foreground selection:bg-selection selection:text-selection-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
  {
    variants: {
      variant: {
        default: '',
        compact: 'h-7 py-1 text-2xs font-semibold tracking-wide text-subtle uppercase',
      },
      align: {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
      },
      width: {
        auto: '',
        sm: 'w-[100px]',
        md: 'w-[150px]',
        lg: 'w-[200px]',
        xl: 'w-[250px]',
        fit: 'w-fit',
        full: 'w-full',
      },
    },
    defaultVariants: {
      align: 'left',
      width: 'auto',
    },
  }
);

export const tableCellVariants = cva(
  'p-4 align-middle whitespace-nowrap selection:bg-selection selection:text-selection-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
  {
    variants: {
      align: {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
      },
      variant: {
        default: '',
        detail: 'bg-surface-recess [--table-row-wash:var(--color-surface-recess)]',
      },
      density: {
        comfortable: '',
        standard: 'py-2',
        compact: 'py-1.5',
        dense: 'py-1',
        none: 'p-0',
      },
      font: {
        body: '',
        mono: 'font-mono',
      },
      size: {
        sm: 'text-body-sm',
        md: 'text-body',
        lg: 'text-body-lg',
      },
      tone: {
        default: '',
        muted: 'text-subtle',
        success: 'text-success',
        destructive: 'text-destructive',
      },
      numeric: {
        true: 'tabular-nums',
        false: '',
      },
      weight: {
        normal: 'font-normal',
        medium: 'font-medium',
        semibold: 'font-semibold',
        bold: 'font-bold',
      },
      truncate: {
        none: '',
        truncate: 'max-w-0 truncate',
      },
    },
    defaultVariants: {
      align: 'left',
      weight: 'normal',
      truncate: 'none',
    },
  }
);

/** One boundary column per logical edge; the opaque base prevents scrolled text showing through row washes. */
export const tablePinnedVariants = cva('', {
  variants: {
    pinned: {
      start:
        'sticky inset-s-0 z-10 border-e bg-card bg-[linear-gradient(var(--table-row-wash,transparent),var(--table-row-wash,transparent))]',
      end: 'sticky inset-e-0 z-10 border-s bg-card bg-[linear-gradient(var(--table-row-wash,transparent),var(--table-row-wash,transparent))]',
    },
  },
});
