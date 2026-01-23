import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const tableVariants = cva(
  'relative w-full min-w-0 overflow-x-auto rounded-lg border border-base-200 border-solid bg-white p-0 shadow-shadow-elevated dark:border-base-800 dark:bg-base-900',
  {
    variants: {
      variant: {
        standard: '',
        simple: 'border-0 bg-transparent shadow-none dark:bg-transparent',
        bordered: 'border-2',
        card: 'shadow-lg',
      },
      size: {
        sm: '[&_table]:text-xs',
        md: '[&_table]:text-sm',
        lg: '[&_table]:text-base',
      },
    },
    defaultVariants: {
      variant: 'standard',
      size: 'md',
    },
  }
);

const tableHeadVariants = cva(
  'h-10 whitespace-nowrap px-4 align-middle font-medium text-foreground selection:bg-selected selection:text-selected-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
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
  }
);

const tableCellVariants = cva(
  'whitespace-nowrap p-4 align-middle selection:bg-selected selection:text-selected-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
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

interface TableProps extends React.ComponentProps<'table'>, VariantProps<typeof tableVariants>, SharedProps {}

function Table({ className, variant, size, testId, ...props }: TableProps) {
  return (
    <div className={cn(tableVariants({ variant, size }))} data-slot="table-container" data-testid={testId}>
      <table className={cn('w-full caption-bottom', className)} data-slot="table" {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'> & SharedProps) {
  const { testId, ...restProps } = props as React.ComponentProps<'thead'> & SharedProps;
  return (
    <thead className={cn('[&_tr]:border-b', className)} data-slot="table-header" data-testid={testId} {...restProps} />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'> & SharedProps) {
  const { testId, ...restProps } = props as React.ComponentProps<'tbody'> & SharedProps;
  return (
    <tbody
      className={cn('[&_tr:hover]:bg-selected/10 [&_tr:last-child]:border-0', className)}
      data-slot="table-body"
      data-testid={testId}
      {...restProps}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      data-slot="table-footer"
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'> & SharedProps) {
  const { testId, ...restProps } = props as React.ComponentProps<'tr'> & SharedProps;
  return (
    <tr
      className={cn('border-b transition-colors data-[state=selected]:bg-primary/20', className)}
      data-slot="table-row"
      data-testid={testId}
      {...restProps}
    />
  );
}

interface TableHeadProps
  extends Omit<React.ComponentProps<'th'>, 'align'>,
    VariantProps<typeof tableHeadVariants>,
    SharedProps {}

function TableHead({ className, align, width, testId, ...props }: TableHeadProps) {
  return (
    <th
      className={cn(tableHeadVariants({ align, width }), className)}
      data-slot="table-head"
      data-testid={testId}
      {...props}
    />
  );
}

interface TableCellProps
  extends Omit<React.ComponentProps<'td'>, 'align'>,
    VariantProps<typeof tableCellVariants>,
    SharedProps {}

function TableCell({ className, align, weight, truncate, testId, ...props }: TableCellProps) {
  return (
    <td
      className={cn(tableCellVariants({ align, weight, truncate }), className)}
      data-slot="table-cell"
      data-testid={testId}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      className={cn(
        'mt-4 mb-4 text-muted-foreground text-sm selection:bg-selected selection:text-selected-foreground',
        className
      )}
      data-slot="table-caption"
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
