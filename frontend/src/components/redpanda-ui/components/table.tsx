import type { VariantProps } from 'class-variance-authority';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';
import { tableCellVariants, tableHeadVariants, tablePinnedVariants, tableVariants } from './table/variants';

interface TableProps extends React.ComponentProps<'table'>, VariantProps<typeof tableVariants>, SharedProps {
  /** Scroll events from the table's actual viewport, not the native table element. */
  onViewportScroll?: React.UIEventHandler<HTMLElement> | undefined;
}

function Table({ className, variant, size, stickyHeader, onViewportScroll, testId, ...props }: TableProps) {
  const table = <table className={cn('w-full caption-bottom', className)} data-slot="table" {...props} />;
  if (stickyHeader === true) {
    return (
      <section
        aria-label={props['aria-label'] ?? 'Scrollable table'}
        aria-labelledby={props['aria-labelledby']}
        className={cn(tableVariants({ variant, size, stickyHeader }))}
        data-slot="table-container"
        data-testid={testId}
        onScroll={onViewportScroll}
        tabIndex={0}
      >
        {table}
      </section>
    );
  }
  return (
    <div
      className={cn(tableVariants({ variant, size }))}
      data-slot="table-container"
      data-testid={testId}
      onScroll={onViewportScroll}
    >
      {table}
    </div>
  );
}

function TableHeader({ className, testId, ...props }: React.ComponentProps<'thead'> & SharedProps) {
  return (
    <thead className={cn('[&_tr]:border-b', className)} data-slot="table-header" data-testid={testId} {...props} />
  );
}

function TableBody({ className, testId, ...props }: React.ComponentProps<'tbody'> & SharedProps) {
  return (
    <tbody
      className={cn(
        // No `active:` step here, unlike other rows: dragging across a table to
        // select text holds the pointer down, and a pressed fill would flash
        // through the whole selection.
        '[&_tr]:hover:bg-accent [&_tr]:hover:[--table-row-wash:var(--color-accent)] [&_tr:last-child]:border-0',
        className
      )}
      data-slot="table-body"
      data-testid={testId}
      {...props}
    />
  );
}

function TableFooter({ className, testId, ...props }: React.ComponentProps<'tfoot'> & SharedProps) {
  return (
    <tfoot
      className={cn('border-t bg-surface-recess font-medium [&>tr]:last:border-b-0', className)}
      data-slot="table-footer"
      data-testid={testId}
      {...props}
    />
  );
}

interface TableRowProps extends React.ComponentProps<'tr'>, SharedProps {
  /** Mark a caller-ordered pinned row; this does not add sticky positioning or reorder data. */
  pinned?: 'top' | 'bottom' | undefined;
}

function TableRow({ className, pinned, testId, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        // `selected-wash`, not a `-pressed` step: selection is a rest state, and a state token as a
        // rest value moves whenever that ramp is retuned.
        // WebKit does not paint collapsed table-row shadows; a non-layout pseudo paints one continuous ring.
        'border-b transition-colors [--table-row-wash:transparent] focus-visible:relative focus-visible:outline-none focus-visible:after:pointer-events-none focus-visible:after:absolute focus-visible:after:inset-0 focus-visible:after:z-20 focus-visible:after:ring-3 focus-visible:after:ring-primary focus-visible:after:ring-inset has-aria-expanded:bg-accent has-aria-expanded:[--table-row-wash:var(--color-accent)] data-[state=selected]:bg-selected-wash data-[state=selected]:[--table-row-wash:var(--color-selected-wash)] motion-reduce:transition-none',
        '[&[data-pinned]:not(:hover):not([data-state=selected]):not(:has([aria-expanded=true]))]:bg-surface-recess [&[data-pinned]:not(:hover):not([data-state=selected]):not(:has([aria-expanded=true]))]:[--table-row-wash:var(--color-surface-recess)]',
        className
      )}
      data-pinned={pinned}
      data-slot="table-row"
      data-testid={testId}
      {...props}
    />
  );
}

interface TableHeadProps
  extends Omit<React.ComponentProps<'th'>, 'align'>,
    VariantProps<typeof tableHeadVariants>,
    VariantProps<typeof tablePinnedVariants>,
    SharedProps {
  /** Dim the active sortable column; supply DnD geometry through --sortable-transform/transition. */
  dragging?: boolean | undefined;
}

function TableHead({ className, align, width, variant, pinned, dragging, testId, ...props }: TableHeadProps) {
  return (
    <th
      className={cn(
        tableHeadVariants({ align, width, variant }),
        tablePinnedVariants({ pinned }),
        pinned !== undefined && pinned !== null && 'z-20',
        'transform-(--sortable-transform) transition-sortable data-[dragging]:opacity-60',
        className
      )}
      data-dragging={dragging === true || undefined}
      data-pinned={pinned ?? undefined}
      data-slot="table-head"
      data-testid={testId}
      {...props}
    />
  );
}

interface TableCellProps
  extends Omit<React.ComponentProps<'td'>, 'align'>,
    VariantProps<typeof tableCellVariants>,
    VariantProps<typeof tablePinnedVariants>,
    SharedProps {}

function TableCell({
  className,
  align,
  pinned,
  weight,
  truncate,
  numeric,
  density,
  font,
  size,
  tone,
  variant,
  testId,
  ...props
}: TableCellProps) {
  return (
    <td
      className={cn(
        tableCellVariants({ align, weight, truncate, numeric, density, font, size, tone, variant }),
        tablePinnedVariants({ pinned }),
        className
      )}
      data-pinned={pinned ?? undefined}
      data-slot="table-cell"
      data-testid={testId}
      {...props}
    />
  );
}

function TableCaption({ className, testId, ...props }: React.ComponentProps<'caption'> & SharedProps) {
  return (
    <caption
      className={cn(
        'mt-4 mb-4 text-body text-subtle selection:bg-selection selection:text-selection-foreground',
        className
      )}
      data-slot="table-caption"
      data-testid={testId}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
