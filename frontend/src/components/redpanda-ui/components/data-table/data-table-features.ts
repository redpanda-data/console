// Copyright 2026 Redpanda Data, Inc.

import {
  type Column,
  type ColumnDef,
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  filterFn_arrHas,
  filterFn_arrIncludes,
  filterFn_arrIncludesSome,
  filterFn_equals,
  filterFn_includesString,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  filterFn_weakEquals,
  globalFilteringFeature,
  metaHelper,
  type ReactTable,
  type Row,
  type RowData,
  rowExpandingFeature,
  rowPaginationFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  type TableOptions,
  type TableState,
  tableFeatures,
} from '@tanstack/react-table';

export const dataTableFeatures = tableFeatures({
  columnMeta: metaHelper<DataTableColumnMeta>(),
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    arrHas: filterFn_arrHas,
    arrIncludes: filterFn_arrIncludes,
    arrIncludesSome: filterFn_arrIncludesSome,
    equals: filterFn_equals,
    inDateRange: filterFn_inDateRange,
    inNumberRange: filterFn_inNumberRange,
    includesString: filterFn_includesString,
    weakEquals: filterFn_weakEquals,
  },
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  columnVisibilityFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnResizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowPinningFeature,
  rowSelectionFeature,
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
});

export type DataTableColumnMeta = { label?: string };
export type DataTableFeatures = typeof dataTableFeatures;
export type DataTableRenderState = Omit<TableState<DataTableFeatures>, 'rowSelection'>;
export type DataTableColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<DataTableFeatures, TData, TValue>;
export type DataTableColumn<TData extends RowData, TValue = unknown> = Column<DataTableFeatures, TData, TValue>;
export type DataTableRow<TData extends RowData> = Row<DataTableFeatures, TData>;
export type DataTableInstance<TData extends RowData, TSelected = TableState<DataTableFeatures>> = ReactTable<
  DataTableFeatures,
  TData,
  TSelected
>;
export type DataTableRenderInstance<TData extends RowData> = DataTableInstance<TData, DataTableRenderState>;
export type DataTableOptions<TData extends RowData> = Omit<
  Partial<TableOptions<DataTableFeatures, TData>>,
  'columns' | 'data' | 'features'
>;

export const {
  createAppColumnHelper: createDataTableColumnHelper,
  useAppTable: useDataTable,
  useTableContext: useDataTableContext,
} = createTableHook({ features: dataTableFeatures });
