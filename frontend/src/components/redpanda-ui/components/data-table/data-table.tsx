'use client';

import type { RowData } from '@tanstack/react-table';
import React from 'react';
import { useLayoutEffect } from '../../lib/use-layout-effect';
import {
  type DataTableColumnDef,
  type DataTableOptions,
  type DataTableRenderInstance,
  type DataTableRenderState,
  type DataTableRow,
  useDataTable,
} from './data-table-features';
import { type DataTablePresentationProps, DataTableRenderer } from './data-table-view';
import { type DataTableResponsiveColumnRule, useDataTableResponsiveColumns } from './use-data-table-responsive-columns';

export type { DataTableClassNames } from './data-table-view';

const NO_RESPONSIVE_COLUMNS: readonly DataTableResponsiveColumnRule[] = [];

export interface DataTableProps<TData extends RowData>
  extends Omit<DataTablePresentationProps<TData>, 'toolbar' | 'ref'> {
  columns: readonly DataTableColumnDef<TData>[];
  data: readonly TData[];
  /** Whether filtering, sorting, and pagination run locally or on an external data source. */
  dataMode?: 'client' | 'server' | undefined;
  getRowCanExpand?: ((row: DataTableRow<TData>) => boolean) | undefined;
  pagination?: boolean | undefined;
  /** Container-width rules that own visibility for the columns they list. Keep this array stable across renders. */
  responsiveColumns?: readonly DataTableResponsiveColumnRule[] | undefined;
  selectable?: boolean | undefined;
  sorting?: boolean | undefined;
  tableOptions?: DataTableOptions<TData> | undefined;
  toolbar?: React.ReactNode | ((table: DataTableRenderInstance<TData>) => React.ReactNode) | undefined;
}

const selectDataTableRenderState = (
  state: DataTableRenderInstance<RowData>['store']['state']
): DataTableRenderState => {
  const { rowSelection: _rowSelection, ...renderState } = state;
  return renderState;
};

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
  const initialState = {
    pagination: { pageIndex: 0, pageSize: 10 },
    ...tableOptions?.initialState,
  };

  const table = useDataTable(
    {
      data,
      columns,
      autoResetPageIndex: false,
      autoResetExpanded: false,
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

  const pageCount = table.getPageCount();
  const pageIndex = table.state.pagination.pageIndex;
  const pageCountIsKnown =
    table.options.manualPagination !== true ||
    table.options.pageCount !== undefined ||
    table.options.rowCount !== undefined;
  const clampPending = pagination && pageCountIsKnown && pageCount > 0 && pageIndex >= pageCount;

  function clampPageIndex() {
    if (clampPending && !isLoading) {
      table.setPageIndex(pageCount - 1);
    }
  }

  useLayoutEffect(clampPageIndex, [clampPending, isLoading, pageCount, table]);

  const toolbarContent = typeof toolbar === 'function' ? toolbar(table) : toolbar;

  return (
    <DataTableRenderer
      className={className}
      classNames={classNames}
      emptyAction={emptyAction}
      emptyText={emptyText}
      expandRowByClick={expandRowByClick}
      getRowAriaLabel={getRowAriaLabel}
      isLoading={isLoading}
      isRowClickable={isRowClickable}
      loadingText={loadingText}
      onRow={onRow}
      pageSizeOptions={pageSizeOptions}
      pageTransitionPending={clampPending}
      ref={responsiveContainerRef}
      rowClassName={rowClassName}
      selectable={selectable}
      showPagination={pagination}
      size={size}
      subComponent={subComponent}
      table={table}
      testId={testId}
      toolbar={toolbarContent}
      variant={variant}
    />
  );
}
