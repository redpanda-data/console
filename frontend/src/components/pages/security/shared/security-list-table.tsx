import type { RowData } from '@tanstack/react-table';
import type { ComponentProps, ReactNode } from 'react';
import { readColumnMeta } from 'utils/data-table-column-meta';

import { Skeleton } from '../../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../redpanda-ui/components/table';
import type { SecurityListTableInstance } from '../hooks/use-security-list-table';

const SKELETON_ROW_KEYS = [0, 1, 2];

type SkeletonWidth = ComponentProps<typeof Skeleton>['width'];

type SecurityListTableProps<TData extends RowData> = {
  table: SecurityListTableInstance<TData>;
  isLoading: boolean;
  /** Placeholder width per column id while loading; columns without one stay empty. */
  skeletonWidths: Partial<Record<string, SkeletonWidth>>;
  emptyState: ReactNode;
};

const SkeletonRows = ({ columnIds, widths }: { columnIds: string[]; widths: Partial<Record<string, SkeletonWidth>> }) =>
  SKELETON_ROW_KEYS.map((rowKey) => (
    <TableRow key={rowKey}>
      {columnIds.map((columnId) => (
        <TableCell key={columnId}>
          {widths[columnId] ? <Skeleton variant="text" width={widths[columnId]} /> : null}
        </TableCell>
      ))}
    </TableRow>
  ));

function SecurityListTableRows<TData extends RowData>({
  table,
  isLoading,
  skeletonWidths,
  emptyState,
}: SecurityListTableProps<TData>) {
  if (isLoading) {
    return <SkeletonRows columnIds={table.getAllLeafColumns().map((column) => column.id)} widths={skeletonWidths} />;
  }
  const { rows } = table.getRowModel();
  if (rows.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={table.getAllLeafColumns().length}>{emptyState}</TableCell>
      </TableRow>
    );
  }
  return rows.map((row) => (
    <TableRow key={row.id}>
      {row.getVisibleCells().map((cell) => (
        <TableCell align={readColumnMeta(cell.column.columnDef.meta).align} key={cell.id}>
          <table.FlexRender cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

/** Data table of a Security list tab, with loading placeholders and an empty state. */
export function SecurityListTable<TData extends RowData>(props: SecurityListTableProps<TData>) {
  const { table } = props;
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead align={readColumnMeta(header.column.columnDef.meta).align} key={header.id}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        <SecurityListTableRows {...props} />
      </TableBody>
    </Table>
  );
}
