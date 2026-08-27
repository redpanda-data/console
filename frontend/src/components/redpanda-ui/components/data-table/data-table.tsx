'use client';

import { type RowData, Subscribe } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import React from 'react';

import { Checkbox } from '../checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../table';
import { useLayoutEffect } from '../../lib/use-layout-effect';
import { cn } from '../../lib/utils';

import {
  type DataTableColumnDef,
  type DataTableOptions,
  type DataTableRenderInstance,
  type DataTableRenderState,
  type DataTableRow,
  useDataTable,
} from './data-table-features';
import { DataTablePagination } from './data-table-pagination';
import { deriveDisplayState, isRowActivationClick, resolvePageDisplayState } from './data-table-utils';
import { type DataTableResponsiveColumnRule, useDataTableResponsiveColumns } from './use-data-table-responsive-columns';

const NO_RESPONSIVE_COLUMNS: readonly DataTableResponsiveColumnRule[] = [];

export type DataTableClassNames = {
  root?: string;
  table?: string;
  header?: string;
  headerRow?: string;
  headerCell?: string;
  body?: string;
  row?: string;
  cell?: string;
  footer?: string;
  empty?: string;
  loading?: string;
  toolbar?: string;
};

export type DataTableProps<TData extends RowData> = {
  data: readonly TData[];
  columns: readonly DataTableColumnDef<TData>[];

  isLoading?: boolean;
  loadingText?: string;
  emptyText?: string;
  emptyAction?: React.ReactNode;

  subComponent?: (props: { row: DataTableRow<TData> }) => React.ReactNode;
  getRowCanExpand?: (row: DataTableRow<TData>) => boolean;
  expandRowByClick?: boolean;

  pagination?: boolean;
  pageSizeOptions?: number[];
  sorting?: boolean;
  selectable?: boolean;
  /** Whether filtering, sorting, and pagination run locally or on an external data source. */
  dataMode?: 'client' | 'server';
  /** Container-width rules that own visibility for the columns they list. Keep this array stable across renders. */
  responsiveColumns?: readonly DataTableResponsiveColumnRule[];

  size?: 'sm' | 'md' | 'lg';
  variant?: 'standard' | 'simple' | 'bordered' | 'card';

  toolbar?: React.ReactNode | ((table: DataTableRenderInstance<TData>) => React.ReactNode);

  onRow?: (row: DataTableRow<TData>) => void;
  /** Restrict `onRow` activation to eligible rows. */
  isRowClickable?: (row: DataTableRow<TData>) => boolean;
  /** Accessible action name for rows activated through `onRow` or expansion. */
  getRowAriaLabel?: (row: DataTableRow<TData>) => string | undefined;
  rowClassName?: (row: DataTableRow<TData>) => string;

  classNames?: DataTableClassNames;
  tableOptions?: DataTableOptions<TData>;
  className?: string;
  testId?: string;
};

const createSelectColumn = <TData extends RowData>(): DataTableColumnDef<TData> => ({
  id: 'select',
  header: ({ table }) => (
    <Subscribe
      selector={() => ({
        all: table.getIsAllPageRowsSelected(),
        some: table.getIsSomePageRowsSelected(),
      })}
      source={table.atoms.rowSelection}
    >
      {({ all, some }) => (
        <Checkbox
          aria-label="Select all"
          checked={all || (some && !all ? 'indeterminate' : false)}
          className="translate-y-[2px]"
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
        />
      )}
    </Subscribe>
  ),
  cell: ({ row, table }) =>
    row.getCanSelect() ? (
      <Subscribe selector={(selection) => Boolean(selection[row.id])} source={table.atoms.rowSelection}>
        {(selected) => (
          <Checkbox
            aria-label="Select row"
            checked={selected}
            className="translate-y-[2px]"
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        )}
      </Subscribe>
    ) : null,
  enableSorting: false,
  enableHiding: false,
});

const selectDataTableRenderState = <TData extends RowData>(
  state: DataTableRenderInstance<TData>['store']['state']
): DataTableRenderState => {
  const { rowSelection: _rowSelection, ...renderState } = state;
  return renderState;
};

type DataTableBodyRowProps<TData extends RowData> = {
  row: DataTableRow<TData>;
  table: DataTableRenderInstance<TData>;
  expandRowByClick: boolean;
  subComponent?: (props: { row: DataTableRow<TData> }) => React.ReactNode;
  onRow?: (row: DataTableRow<TData>) => void;
  isRowClickable?: (row: DataTableRow<TData>) => boolean;
  getRowAriaLabel?: (row: DataTableRow<TData>) => string | undefined;
  rowClassName?: (row: DataTableRow<TData>) => string;
  classNames?: DataTableClassNames;
};

function DataTableBodyRow<TData extends RowData>({
  row,
  table,
  expandRowByClick,
  subComponent,
  onRow,
  isRowClickable,
  getRowAriaLabel,
  rowClassName,
  classNames,
}: DataTableBodyRowProps<TData>) {
  const rowIsActivatable = expandRowByClick ? row.getCanExpand() : Boolean(onRow) && (isRowClickable?.(row) ?? true);
  const cells = row.getVisibleCells().map((cell) => (
    <TableCell className={classNames?.cell} key={cell.id}>
      <table.FlexRender cell={cell} />
    </TableCell>
  ));

  function activateRow() {
    if (expandRowByClick) {
      row.toggleExpanded();
      return;
    }
    onRow?.(row);
  }

  function handleClick(event: React.MouseEvent<HTMLTableRowElement>) {
    if (isRowActivationClick(event.target, event.currentTarget)) {
      activateRow();
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    const isActivationKey = event.key === 'Enter' || event.key === ' ';
    if (!isActivationKey || event.repeat || event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    activateRow();
  }

  return (
    <>
      <Subscribe selector={(selection) => Boolean(selection[row.id])} source={table.atoms.rowSelection}>
        {(selected) => (
          <TableRow
            aria-expanded={expandRowByClick && row.getCanExpand() ? row.getIsExpanded() : undefined}
            aria-label={rowIsActivatable ? getRowAriaLabel?.(row) : undefined}
            className={cn(
              // Outline, not ring: box shadows do not paint on rows in a border-collapsed table.
              rowIsActivatable &&
                'cursor-pointer focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2',
              classNames?.row,
              rowClassName?.(row)
            )}
            data-state={selected ? 'selected' : undefined}
            onClick={rowIsActivatable ? handleClick : undefined}
            onKeyDown={rowIsActivatable ? handleKeyDown : undefined}
            tabIndex={rowIsActivatable ? 0 : undefined}
          >
            {cells}
          </TableRow>
        )}
      </Subscribe>
      {row.getIsExpanded() && subComponent ? (
        <TableRow>
          <TableCell className="p-0" colSpan={row.getVisibleCells().length}>
            {subComponent({ row })}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export function DataTable<TData extends RowData>({
  data,
  columns,
  isLoading = false,
  loadingText = 'Loading...',
  emptyText = 'No results.',
  emptyAction,
  subComponent,
  getRowCanExpand,
  expandRowByClick = false,
  pagination = true,
  pageSizeOptions,
  sorting = true,
  selectable = false,
  dataMode = 'client',
  responsiveColumns = NO_RESPONSIVE_COLUMNS,
  size,
  variant,
  toolbar,
  onRow,
  isRowClickable,
  getRowAriaLabel,
  rowClassName,
  classNames,
  tableOptions,
  className,
  testId,
}: DataTableProps<TData>) {
  const allColumns = React.useMemo(
    () => (selectable ? [createSelectColumn<TData>(), ...columns] : columns),
    [columns, selectable]
  );
  const initialState = React.useMemo(
    () => ({
      pagination: { pageIndex: 0, pageSize: 10 },
      ...tableOptions?.initialState,
    }),
    [tableOptions?.initialState]
  );

  const table = useDataTable(
    {
      data,
      columns: allColumns,
      autoResetPageIndex: false,
      enableRowSelection: selectable,
      enableSorting: sorting,
      getRowCanExpand: getRowCanExpand ?? (() => Boolean(subComponent)),
      manualPagination: !pagination,
      manualSorting: !sorting,
      ...tableOptions,
      ...(dataMode === 'server'
        ? {
            manualFiltering: true,
            manualPagination: true,
            manualSorting: true,
          }
        : {}),
      initialState,
    },
    selectDataTableRenderState
  );
  const responsiveContainerRef = React.useRef<HTMLDivElement>(null);
  useDataTableResponsiveColumns(table, responsiveContainerRef, responsiveColumns);

  const rows = table.getRowModel().rows;
  const filteredRowCount = table.getFilteredRowModel().rows.length;
  const totalColumns = table.getVisibleFlatColumns().length;
  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;
  const pageCountIsKnown =
    !table.options.manualPagination || table.options.pageCount !== undefined || table.options.rowCount !== undefined;
  const clampPending = pagination && pageCountIsKnown && pageCount > 0 && pageIndex >= pageCount;

  function clampPageIndex() {
    if (clampPending && !isLoading) {
      table.setPageIndex(pageCount - 1);
    }
  }

  useLayoutEffect(clampPageIndex, [clampPending, isLoading, pageCount, table]);

  const displayState = resolvePageDisplayState(
    deriveDisplayState(filteredRowCount, isLoading),
    rows.length,
    clampPending
  );
  const toolbarContent = typeof toolbar === 'function' ? toolbar(table) : toolbar;

  return (
    <table.AppTable>
      <div
        className={cn('flex flex-col gap-4', classNames?.root, className)}
        data-testid={testId}
        ref={responsiveContainerRef}
      >
        {toolbarContent ? <div className={classNames?.toolbar}>{toolbarContent}</div> : null}

        <Table className={classNames?.table} size={size} variant={variant}>
          <TableHeader className={classNames?.header}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className={classNames?.headerRow} key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead className={classNames?.headerCell} colSpan={header.colSpan} key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody className={classNames?.body}>
            {displayState === 'loading' ? (
              <TableRow>
                <TableCell className={cn('h-24', classNames?.loading)} colSpan={totalColumns}>
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="size-5 animate-spin text-subtle" />
                    <div className="text-body text-subtle">{loadingText}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {displayState === 'empty' ? (
              <TableRow>
                <TableCell className={cn('h-24', classNames?.empty)} colSpan={totalColumns}>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="text-body text-subtle">{emptyText}</div>
                    {emptyAction}
                  </div>
                </TableCell>
              </TableRow>
            ) : null}

            {displayState === 'data'
              ? rows.map((row) => (
                  <DataTableBodyRow
                    classNames={classNames}
                    expandRowByClick={expandRowByClick}
                    getRowAriaLabel={getRowAriaLabel}
                    isRowClickable={isRowClickable}
                    key={row.id}
                    onRow={onRow}
                    row={row}
                    rowClassName={rowClassName}
                    subComponent={subComponent}
                    table={table}
                  />
                ))
              : null}
          </TableBody>
        </Table>

        {pagination ? (
          <div className={classNames?.footer}>
            <DataTablePagination pageSizeOptions={pageSizeOptions} table={table} />
          </div>
        ) : null}
      </div>
    </table.AppTable>
  );
}
