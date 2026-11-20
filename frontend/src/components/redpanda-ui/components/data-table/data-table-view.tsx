// Copyright 2026 Redpanda Data, Inc.

'use client';

import type { RowData } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import type React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../table';
import { hasSlotContent } from '../../lib/has-slot-content';
import { cn } from '../../lib/utils';
import { DataTableBodyRow } from './data-table-body-row';
import type { DataTableController, DataTableRow } from './data-table-features';
import { DataTablePagination } from './data-table-pagination';
import { DataTablePageSelection } from './data-table-selection';
import { type DisplayState, deriveDisplayState, resolvePageDisplayState } from './data-table-utils';

export interface DataTableClassNames {
  body?: string;
  cell?: string;
  empty?: string;
  footer?: string;
  header?: string;
  headerCell?: string;
  headerRow?: string;
  loading?: string;
  root?: string;
  row?: string;
  table?: string;
  toolbar?: string;
}

export interface DataTablePresentationProps<TData extends RowData> {
  className?: string | undefined;

  classNames?: DataTableClassNames | undefined;
  emptyAction?: React.ReactNode | undefined;
  emptyText?: string | undefined;
  expandRowByClick?: boolean | undefined;
  /** Accessible action name for rows activated through `onRow` or expansion. */
  getRowAriaLabel?: ((row: DataTableRow<TData>) => string | undefined) | undefined;

  isLoading?: boolean | undefined;
  /** Restrict `onRow` activation to eligible rows. */
  isRowClickable?: ((row: DataTableRow<TData>) => boolean) | undefined;
  loadingText?: string | undefined;

  onRow?: ((row: DataTableRow<TData>) => void) | undefined;
  pageSizeOptions?: number[] | undefined;

  ref?: React.Ref<HTMLDivElement> | undefined;
  rowClassName?: ((row: DataTableRow<TData>) => string | undefined) | undefined;

  size?: 'sm' | 'md' | 'lg' | undefined;

  subComponent?: ((props: { row: DataTableRow<TData> }) => React.ReactNode) | undefined;
  testId?: string | undefined;

  toolbar?: React.ReactNode | undefined;
  variant?: 'standard' | 'simple' | 'bordered' | 'card' | undefined;
}

export interface DataTableViewProps<TData extends RowData> extends DataTablePresentationProps<TData> {
  /** Show controls without enabling, disabling, or changing the controller's pagination model. */
  showPagination?: boolean | undefined;
  /** Existing useDataTable controller. The caller retains every state and model option. */
  table: Omit<DataTableController<TData>, 'state'>;
}

interface DataTableRendererProps<TData extends RowData> extends DataTableViewProps<TData> {
  pageTransitionPending?: boolean | undefined;
  selectable?: boolean | undefined;
}

function getDataTableViewModel<TData extends RowData>(table: Omit<DataTableController<TData>, 'state'>) {
  return {
    headers: table.getHeaderGroups(),
    rows: table.getRowModel().rows,
    filteredRowCount: table.getFilteredRowModel().rows.length,
    totalColumns: table.getVisibleLeafColumns().length,
  };
}

type DataTableViewModel<TData extends RowData> = ReturnType<typeof getDataTableViewModel<TData>>;

function DataTablePlaceholder({
  state,
  columns,
  classNames,
  loadingText,
  emptyText,
  emptyAction,
}: {
  state: Exclude<DisplayState, 'data'>;
  columns: number;
  classNames: DataTableClassNames | undefined;
  loadingText: string;
  emptyText: string;
  emptyAction: React.ReactNode;
}) {
  return (
    <TableRow>
      <TableCell
        className={cn('h-24', state === 'loading' ? classNames?.loading : classNames?.empty)}
        colSpan={columns}
      >
        {state === 'loading' ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="size-5 text-subtle motion-safe:animate-spin" />
            <div className="text-body text-subtle">{loadingText}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="text-body text-subtle">{emptyText}</div>
            {emptyAction}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function DataTableContent<TData extends RowData>({
  table,
  model,
  isLoading = false,
  pageTransitionPending = false,
  loadingText = 'Loading...',
  emptyText = 'No results.',
  emptyAction,
  className,
  classNames,
  toolbar,
  ref,
  testId,
  size,
  variant,
  expandRowByClick = false,
  getRowAriaLabel,
  isRowClickable,
  onRow,
  rowClassName,
  subComponent,
  showPagination = false,
  pageSizeOptions,
  selectable = false,
}: DataTableRendererProps<TData> & { model: DataTableViewModel<TData> }) {
  const displayState = resolvePageDisplayState(
    deriveDisplayState(model.filteredRowCount, isLoading),
    model.rows.length,
    pageTransitionPending
  );
  return (
    <div
      className={cn('flex w-full min-w-0 flex-col gap-4', classNames?.root, className)}
      data-testid={testId}
      ref={ref}
    >
      {hasSlotContent(toolbar) ? <div className={classNames?.toolbar}>{toolbar}</div> : null}
      <Table className={classNames?.table} size={size} variant={variant}>
        <TableHeader className={classNames?.header}>
          {model.headers.map((headerGroup, groupIndex) => (
            <TableRow className={classNames?.headerRow} key={headerGroup.id}>
              {selectable && groupIndex === 0 && (
                <TableHead className={classNames?.headerCell} rowSpan={model.headers.length}>
                  <DataTablePageSelection table={table} />
                </TableHead>
              )}
              {headerGroup.headers.map((header) => (
                <TableHead className={classNames?.headerCell} colSpan={header.colSpan} key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className={classNames?.body}>
          {displayState === 'data' ? (
            model.rows.map((row) => (
              <DataTableBodyRow
                classNames={classNames}
                expandRowByClick={expandRowByClick}
                getRowAriaLabel={getRowAriaLabel}
                isRowClickable={isRowClickable}
                key={row.id}
                onRow={onRow}
                row={row}
                rowClassName={rowClassName}
                selectable={selectable}
                subComponent={subComponent}
                table={table}
              />
            ))
          ) : (
            <DataTablePlaceholder
              classNames={classNames}
              columns={model.totalColumns + (selectable ? 1 : 0)}
              emptyAction={emptyAction}
              emptyText={emptyText}
              loadingText={loadingText}
              state={displayState}
            />
          )}
        </TableBody>
      </Table>
      {showPagination ? (
        <div className={classNames?.footer}>
          <DataTablePagination pageSizeOptions={pageSizeOptions} table={table} />
        </div>
      ) : null}
    </div>
  );
}

/** Shared complete renderer; pending clamp is private to the controller-owning DataTable. */
export function DataTableRenderer<TData extends RowData>(props: DataTableRendererProps<TData>) {
  const { table } = props;
  return (
    <table.AppTable>
      <table.Subscribe selector={() => getDataTableViewModel(table)}>
        {(model) => <DataTableContent {...props} model={model} />}
      </table.Subscribe>
    </table.AppTable>
  );
}

/** Render an existing controller without taking ownership of its state or processing options. */
export function DataTableView<TData extends RowData>(props: DataTableViewProps<TData>) {
  return <DataTableRenderer {...props} />;
}
