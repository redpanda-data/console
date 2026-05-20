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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../table';
import { Text } from '../typography';
import { cn } from '../../lib/utils';

import { createInitialState, type DataTableInitialConfig, dataTableReducer } from './data-table-reducer';
import { deriveDisplayState, resolvePaginationMode, resolveSortingMode } from './data-table-utils';
import { DataTablePagination } from './index';

// ── ClassNames slots ──────────────────────────────────────────────────
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

// ── Props (discriminated unions for pagination & sorting) ──────────────
type PaginationConfig =
  | {
      pagination?: true | PaginationState;
      onPaginationChange?: OnChangeFn<PaginationState>;
      defaultPageSize?: number;
      pageCount?: number;
    }
  | {
      pagination: false;
      onPaginationChange?: never;
      defaultPageSize?: never;
      pageCount?: never;
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

  // Loading/empty
  isLoading?: boolean;
  loadingText?: string;
  emptyText?: string;
  emptyAction?: React.ReactNode;

  // Expandable rows
  subComponent?: (props: { row: Row<TData> }) => React.ReactNode;
  getRowCanExpand?: (row: Row<TData>) => boolean;
  expandRowByClick?: boolean;

  // Selection
  selectable?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  // Appearance
  size?: 'sm' | 'md' | 'lg';
  variant?: 'standard' | 'simple' | 'bordered' | 'card';

  // Toolbar slot
  toolbar?: React.ReactNode | ((table: TanstackTable<TData>) => React.ReactNode);

  // Row interaction
  onRow?: (row: Row<TData>) => void;
  rowClassName?: (row: Row<TData>) => string;

  // Style slots
  classNames?: DataTableClassNames;

  // Advanced passthrough
  tableOptions?: Partial<TableOptions<TData>>;

  className?: string;
  testId?: string;
};

export type DataTableProps<TData> = DataTableBaseProps<TData> & PaginationConfig & SortingConfig;

// ── Selection column factory ──────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────
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
  // Discriminated union props — destructured explicitly to preserve type safety.
  // TypeScript can't narrow inside the function body for intersected unions, but
  // destructuring here ensures refactors that rename props produce compile errors.
  pagination: paginationProp,
  onPaginationChange: onPaginationChangeProp,
  defaultPageSize: defaultPageSizeProp,
  pageCount: pageCountProp,
  sorting: sortingProp,
  onSortingChange: onSortingChangeProp,
}: DataTableProps<TData>) {
  // Resolve modes (pure, no memo needed — cheap)
  const paginationMode = resolvePaginationMode(paginationProp, defaultPageSizeProp);
  const sortingMode = resolveSortingMode(sortingProp);

  // Internal state via reducer
  const initialConfig: DataTableInitialConfig = {
    defaultPageSize: paginationMode.defaultPageSize,
    defaultSorting: sortingMode.controlledState ?? [],
  };

  const [state, dispatch] = React.useReducer(dataTableReducer, initialConfig, createInitialState);

  // Resolve effective state per feature (controlled vs uncontrolled)
  const effectivePagination = paginationMode.controlledState ?? state.pagination;
  const effectiveSorting = sortingMode.controlledState ?? state.sorting;
  const effectiveRowSelection = rowSelectionProp ?? state.rowSelection;

  // Stable onChange handlers
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

  // Build columns with optional select column
  const allColumns = React.useMemo(
    () => (selectable ? [createSelectColumn<TData>(), ...columns] : columns),
    [selectable, columns]
  );

  // Build table options
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
  const displayState = deriveDisplayState(rows.length, isLoading);
  const totalColumns = table.getVisibleFlatColumns().length;

  // Render toolbar
  const toolbarContent = typeof toolbar === 'function' ? toolbar(table) : toolbar;

  return (
    <div className={cn('flex flex-col gap-4', classNames?.root, className)} data-testid={testId}>
      {toolbarContent && <div className={classNames?.toolbar}>{toolbarContent}</div>}

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
                  <Text className="text-muted-foreground">{loadingText}</Text>
                </div>
              </TableCell>
            </TableRow>
          )}

          {displayState === 'empty' && (
            <TableRow>
              <TableCell className={cn('h-24', classNames?.empty)} colSpan={totalColumns}>
                <div className="flex flex-col items-center justify-center gap-2">
                  <Text className="text-muted-foreground">{emptyText}</Text>
                  {emptyAction}
                </div>
              </TableCell>
            </TableRow>
          )}

          {displayState === 'data' &&
            rows.map((row) => (
              <React.Fragment key={row.id}>
                <TableRow
                  className={cn(classNames?.row, rowClassName?.(row))}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={
                    expandRowByClick
                      ? () => row.getCanExpand() && row.toggleExpanded()
                      : onRow
                        ? () => onRow(row)
                        : undefined
                  }
                  style={expandRowByClick || onRow ? { cursor: 'pointer' } : undefined}
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
            ))}
        </TableBody>

        {paginationMode.enabled && displayState === 'data' && (
          <TableFooter className={classNames?.footer}>
            <TableRow>
              <TableCell className="p-0" colSpan={totalColumns}>
                <DataTablePagination table={table} />
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}
