'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn } from '../lib/utils';

const tableVariants = cva(
  'relative w-full overflow-x-auto p-0 rounded-lg min-w-0 border border-solid bg-white border-base-200 shadow-shadow-elevated dark:bg-base-900 dark:border-base-800',
  {
    variants: {
      variant: {
        default: '',
        simple: 'border-0 shadow-none bg-transparent dark:bg-transparent',
        bordered: 'border-2',
        card: 'shadow-lg',
      },
      size: {
        sm: '[&_table]:text-xs',
        default: '[&_table]:text-sm',
        lg: '[&_table]:text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const tableHeadVariants = cva(
  'text-foreground selection:bg-selected selection:text-selected-foreground h-10 px-4 align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
  {
    variants: {
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
  },
);

const tableCellVariants = cva(
  'selection:bg-selected selection:text-selected-foreground p-4 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
  {
    variants: {
      align: {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
      },
      weight: {
        normal: 'font-normal',
        medium: 'font-medium',
        semibold: 'font-semibold',
        bold: 'font-bold',
      },
      truncate: {
        none: '',
        truncate: 'truncate max-w-0',
      },
    },
    defaultVariants: {
      align: 'left',
      weight: 'normal',
      truncate: 'none',
    },
  },
);

interface TableProps extends React.ComponentProps<'table'>, VariantProps<typeof tableVariants> {
  testId?: string;
}

function Table({ className, variant, size, testId, ...props }: TableProps) {
  return (
    <div data-slot="table-container" className={cn(tableVariants({ variant, size }))} data-testid={testId}>
      <table data-slot="table" className={cn('w-full caption-bottom', className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'> & { testId?: string }) {
  const { testId, ...restProps } = props as React.ComponentProps<'thead'> & { testId?: string };
  return (
    <thead data-slot="table-header" data-testid={testId} className={cn('[&_tr]:border-b', className)} {...restProps} />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'> & { testId?: string }) {
  const { testId, ...restProps } = props as React.ComponentProps<'tbody'> & { testId?: string };
  return (
    <tbody
      data-slot="table-body"
      data-testid={testId}
      className={cn('[&_tr:last-child]:border-0 [&_tr:hover]:bg-selected/10', className)}
      {...restProps}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'> & { testId?: string }) {
  const { testId, ...restProps } = props as React.ComponentProps<'tr'> & { testId?: string };
  return (
    <tr
      data-slot="table-row"
      data-testid={testId}
      className={cn('data-[state=selected]:bg-primary/20 border-b transition-colors', className)}
      {...restProps}
    />
  );
}

interface TableHeadProps extends Omit<React.ComponentProps<'th'>, 'align'>, VariantProps<typeof tableHeadVariants> {
  testId?: string;
}

function TableHead({ className, align, width, testId, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      data-testid={testId}
      className={cn(tableHeadVariants({ align, width }), className)}
      {...props}
    />
  );
}

interface TableCellProps extends Omit<React.ComponentProps<'td'>, 'align'>, VariantProps<typeof tableCellVariants> {
  testId?: string;
}

function TableCell({ className, align, weight, truncate, testId, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      data-testid={testId}
      className={cn(tableCellVariants({ align, weight, truncate }), className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        'text-muted-foreground selection:bg-selected selection:text-selected-foreground mt-4 text-sm mb-4',
        className,
      )}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  tableVariants,
  tableHeadVariants,
  tableCellVariants,
};
