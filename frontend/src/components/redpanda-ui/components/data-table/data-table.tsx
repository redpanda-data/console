'use client';

import {
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type TableOptions,
  type Table as TanstackTable,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import React from 'react';

import { Checkbox } from '../checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../table';
import { useLayoutEffect } from '../../lib/use-layout-effect';
import { cn } from '../../lib/utils';

import { DataTablePagination } from './data-table-pagination';
import { createInitialState, type DataTableInitialConfig, dataTableReducer } from './data-table-reducer';
import {
  deriveDisplayState,
  isRowActivationClick,
  resolvePageDisplayState,
  resolvePaginationMode,
  resolveSortingMode,
} from './data-table-utils';

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

type PaginationConfig =
  | {
      pagination?: true | PaginationState;
      onPaginationChange?: OnChangeFn<PaginationState>;
      defaultPageSize?: number;
      pageCount?: number;
      pageSizeOptions?: number[];
    }
  | {
      pagination: false;
      onPaginationChange?: never;
      defaultPageSize?: never;
      pageCount?: never;
      pageSizeOptions?: never;
    };

type SortingConfig =
  | {
      sorting?: true | SortingState;
      onSortingChange?: OnChangeFn<SortingState>;
    }
  | {
      sorting: false;
      onSortingChange?: never;
    };

type DataTableBaseProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];

  isLoading?: boolean;
  loadingText?: string;
  emptyText?: string;
  emptyAction?: React.ReactNode;

  subComponent?: (props: { row: Row<TData> }) => React.ReactNode;
  getRowCanExpand?: (row: Row<TData>) => boolean;
  expandRowByClick?: boolean;

  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  size?: 'sm' | 'md' | 'lg';
  variant?: 'standard' | 'simple' | 'bordered' | 'card';

  toolbar?: React.ReactNode | ((table: TanstackTable<TData>) => React.ReactNode);

  onRow?: (row: Row<TData>) => void;
  rowClassName?: (row: Row<TData>) => string;

  classNames?: DataTableClassNames;

  tableOptions?: Partial<TableOptions<TData>>;

  className?: string;
  testId?: string;
};

export type DataTableProps<TData> = DataTableBaseProps<TData> & PaginationConfig & SortingConfig;

const createSelectColumn = <TData,>(): ColumnDef<TData, unknown> => ({
  id: 'select',
  header: ({ table }) => (
    <Checkbox
      aria-label="Select all"
      checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
      className="translate-y-[2px]"
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      aria-label="Select row"
      checked={row.getIsSelected()}
      className="translate-y-[2px]"
      onCheckedChange={(value) => row.toggleSelected(!!value)}
    />
  ),
  enableSorting: false,
  enableHiding: false,
});

export function DataTable<TData>({
  data,
  columns,
  isLoading = false,
  loadingText = 'Loading...',
  emptyText = 'No results.',
  emptyAction,
  subComponent,
  getRowCanExpand,
  expandRowByClick = false,
  selectable = false,
  rowSelection: rowSelectionProp,
  onRowSelectionChange: onRowSelectionChangeProp,
  size,
  variant,
  toolbar,
  onRow,
  rowClassName,
  classNames,
  tableOptions: tableOptionsProp,
  className,
  testId,
  // The union props are destructured explicitly — TS can't narrow intersected unions in the body.
  pagination: paginationProp,
  onPaginationChange: onPaginationChangeProp,
  defaultPageSize: defaultPageSizeProp,
  pageCount: pageCountProp,
  pageSizeOptions: pageSizeOptionsProp,
  sorting: sortingProp,
  onSortingChange: onSortingChangeProp,
}: DataTableProps<TData>) {
  const paginationMode = resolvePaginationMode(paginationProp, defaultPageSizeProp);
  const sortingMode = resolveSortingMode(sortingProp);

  const initialConfig: DataTableInitialConfig = {
    defaultPageSize: paginationMode.defaultPageSize,
    defaultSorting: sortingMode.controlledState ?? [],
  };

  const [state, dispatch] = React.useReducer(dataTableReducer, initialConfig, createInitialState);

  const effectivePagination = paginationMode.controlledState ?? state.pagination;
  const effectiveSorting = sortingMode.controlledState ?? state.sorting;
  const effectiveRowSelection = rowSelectionProp ?? state.rowSelection;

  const handlePaginationChange: OnChangeFn<PaginationState> = React.useCallback(
    (updater) => {
      if (onPaginationChangeProp) {
        onPaginationChangeProp(updater);
      } else {
        dispatch({ type: 'SET_PAGINATION', updater });
      }
    },
    [onPaginationChangeProp]
  );

  const handleSortingChange: OnChangeFn<SortingState> = React.useCallback(
    (updater) => {
      if (onSortingChangeProp) {
        onSortingChangeProp(updater);
      } else {
        dispatch({ type: 'SET_SORTING', updater });
      }
    },
    [onSortingChangeProp]
  );

  const handleColumnFiltersChange: OnChangeFn<ColumnFiltersState> = React.useCallback(
    (updater) => dispatch({ type: 'SET_COLUMN_FILTERS', updater }),
    []
  );

  const handleColumnVisibilityChange: OnChangeFn<VisibilityState> = React.useCallback(
    (updater) => dispatch({ type: 'SET_COLUMN_VISIBILITY', updater }),
    []
  );

  const handleRowSelectionChange: OnChangeFn<RowSelectionState> = React.useCallback(
    (updater) => {
      if (onRowSelectionChangeProp) {
        onRowSelectionChangeProp(updater);
      } else {
        dispatch({ type: 'SET_ROW_SELECTION', updater });
      }
    },
    [onRowSelectionChangeProp]
  );

  const handleExpandedChange: OnChangeFn<ExpandedState> = React.useCallback(
    (updater) => dispatch({ type: 'SET_EXPANDED', updater }),
    []
  );

  const allColumns = React.useMemo(
    () => (selectable ? [createSelectColumn<TData>(), ...columns] : columns),
    [selectable, columns]
  );

  const options = React.useMemo<TableOptions<TData>>(() => {
    const base: TableOptions<TData> = {
      data,
      columns: allColumns,
      state: {
        pagination: effectivePagination,
        sorting: effectiveSorting,
        columnFilters: state.columnFilters,
        columnVisibility: state.columnVisibility,
        rowSelection: effectiveRowSelection,
        expanded: state.expanded,
      },
      enableSorting: sortingMode.enabled,
      enableRowSelection: selectable,
      autoResetPageIndex: false,
      onPaginationChange: handlePaginationChange,
      onSortingChange: handleSortingChange,
      onColumnFiltersChange: handleColumnFiltersChange,
      onColumnVisibilityChange: handleColumnVisibilityChange,
      onRowSelectionChange: handleRowSelectionChange,
      onExpandedChange: handleExpandedChange,
      getCoreRowModel: getCoreRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      getSortedRowModel: sortingMode.enabled ? getSortedRowModel() : undefined,
      getFacetedRowModel: getFacetedRowModel(),
      getFacetedUniqueValues: getFacetedUniqueValues(),
      getRowCanExpand: getRowCanExpand ?? (() => Boolean(subComponent)),
    };

    if (paginationMode.enabled) {
      base.getPaginationRowModel = getPaginationRowModel();
    }

    if (pageCountProp !== undefined) {
      base.pageCount = pageCountProp;
    }

    return { ...base, ...tableOptionsProp };
  }, [
    data,
    allColumns,
    effectivePagination,
    effectiveSorting,
    state.columnFilters,
    state.columnVisibility,
    effectiveRowSelection,
    state.expanded,
    sortingMode.enabled,
    selectable,
    paginationMode.enabled,
    pageCountProp,
    handlePaginationChange,
    handleSortingChange,
    handleColumnFiltersChange,
    handleColumnVisibilityChange,
    handleRowSelectionChange,
    handleExpandedChange,
    getRowCanExpand,
    subComponent,
    tableOptionsProp,
  ]);

  const table = useReactTable(options);
  const rows = table.getRowModel().rows;
  const filteredRowCount = table.getFilteredRowModel().rows.length;
  const totalColumns = table.getVisibleFlatColumns().length;

  // autoResetPageIndex is off, so a shrinking filtered set can strand the user past the last page.
  // Only clamp when getPageCount() is trustworthy: under manualPagination without pageCount/rowCount
  // it is derived from the current page and would fight the consumer's controlled state.
  const pageCount = table.getPageCount();
  const pageIndex = effectivePagination.pageIndex;
  const pageCountIsKnown =
    !table.options.manualPagination || table.options.pageCount !== undefined || table.options.rowCount !== undefined;
  const clampPending = paginationMode.enabled && pageCountIsKnown && pageCount > 0 && pageIndex >= pageCount;
  // Layout, not passive: a post-paint clamp flashes a body holding neither rows nor a state.
  useLayoutEffect(() => {
    if (clampPending && !isLoading) {
      table.setPageIndex(pageCount - 1);
    }
  }, [clampPending, isLoading, pageCount, table]);

  // Layered on the clamp, not replaced by it: the clamp only beats paint when it applies
  // synchronously, and it never runs while isLoading or when onPaginationChange is async.
  const displayState = resolvePageDisplayState(
    deriveDisplayState(filteredRowCount, isLoading),
    rows.length,
    clampPending
  );

  const toolbarContent = typeof toolbar === 'function' ? toolbar(table) : toolbar;

  return (
    <div className={cn('flex flex-col gap-4', classNames?.root, className)} data-testid={testId}>
      {toolbarContent ? <div className={classNames?.toolbar}>{toolbarContent}</div> : null}

      <Table className={classNames?.table} size={size} variant={variant}>
        <TableHeader className={classNames?.header}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow className={classNames?.headerRow} key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead className={classNames?.headerCell} colSpan={header.colSpan} key={header.id}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody className={classNames?.body}>
          {displayState === 'loading' && (
            <TableRow>
              <TableCell className={cn('h-24', classNames?.loading)} colSpan={totalColumns}>
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  <div className="text-body text-muted-foreground">{loadingText}</div>
                </div>
              </TableCell>
            </TableRow>
          )}

          {displayState === 'empty' ? (
            <TableRow>
              <TableCell className={cn('h-24', classNames?.empty)} colSpan={totalColumns}>
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="text-body text-muted-foreground">{emptyText}</div>
                  {emptyAction}
                </div>
              </TableCell>
            </TableRow>
          ) : null}

          {displayState === 'data' &&
            rows.map((row) => {
              const rowIsActivatable = expandRowByClick ? row.getCanExpand() : Boolean(onRow);
              const activateRow = () => {
                if (expandRowByClick) {
                  row.toggleExpanded();
                  return;
                }
                onRow?.(row);
              };

              const handleClick = (event: React.MouseEvent<HTMLTableRowElement>) => {
                if (isRowActivationClick(event.target, event.currentTarget)) {
                  activateRow();
                }
              };

              const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                const isActivationKey = event.key === 'Enter' || event.key === ' ';
                // `repeat` filters auto-repeat from a held key: one press is one activation.
                if (!isActivationKey || event.repeat || event.target !== event.currentTarget) {
                  return;
                }
                event.preventDefault();
                activateRow();
              };

              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    aria-expanded={expandRowByClick && row.getCanExpand() ? row.getIsExpanded() : undefined}
                    className={cn(
                      // Outline, not ring: box-shadows don't paint on <tr> under border-collapse.
                      rowIsActivatable &&
                        'cursor-pointer focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2',
                      classNames?.row,
                      rowClassName?.(row)
                    )}
                    data-state={row.getIsSelected() && 'selected'}
                    onClick={rowIsActivatable ? handleClick : undefined}
                    onKeyDown={rowIsActivatable ? handleKeyDown : undefined}
                    tabIndex={rowIsActivatable ? 0 : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell className={classNames?.cell} key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() && subComponent && (
                    <TableRow>
                      <TableCell className="p-0" colSpan={row.getVisibleCells().length}>
                        {subComponent({ row })}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
        </TableBody>
      </Table>

      {paginationMode.enabled ? (
        <div className={classNames?.footer}>
          <DataTablePagination pageSizeOptions={pageSizeOptionsProp} table={table} />
        </div>
      ) : null}
    </div>
  );
}
