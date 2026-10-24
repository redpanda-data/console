import type { ColumnFiltersState, PaginationState, RowData, SortingState, Updater } from '@tanstack/react-table';
import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';
import { useState } from 'react';

import { type DataTableColumnDef, useDataTable } from '../../../redpanda-ui/components/data-table';

export type ColumnFiltersBinding = {
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: (updater: Updater<ColumnFiltersState>) => void;
};

const resolveUpdater = <T>(updater: Updater<T>, current: T): T =>
  typeof updater === 'function' ? (updater as (old: T) => T)(current) : updater;

const findFilterValue = (filters: ColumnFiltersState, id: string) => filters.find((f) => f.id === id)?.value;

/** Name filter of a Security list, kept in the `name` search param. */
export function useNameColumnFilter(): ColumnFiltersBinding {
  const [urlFilterParams, setUrlFilterParams] = useQueryStates({ name: parseAsString });
  const columnFilters: ColumnFiltersState = urlFilterParams.name ? [{ id: 'name', value: urlFilterParams.name }] : [];

  const onColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = resolveUpdater(updater, columnFilters);
    setUrlFilterParams({ name: (findFilterValue(next, 'name') as string) || null });
  };

  return { columnFilters, onColumnFiltersChange };
}

/** Name and SASL mechanism filters of the users list, kept in the `name` and `mechanism` search params. */
export function useUserColumnFilters(): ColumnFiltersBinding {
  const [urlFilterParams, setUrlFilterParams] = useQueryStates({
    name: parseAsString,
    mechanism: parseAsArrayOf(parseAsString),
  });
  const columnFilters: ColumnFiltersState = [
    ...(urlFilterParams.name ? [{ id: 'name', value: urlFilterParams.name }] : []),
    ...(urlFilterParams.mechanism?.length ? [{ id: 'mechanism', value: urlFilterParams.mechanism }] : []),
  ];

  const onColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = resolveUpdater(updater, columnFilters);
    const mechanism = findFilterValue(next, 'mechanism') as string[] | undefined;
    setUrlFilterParams({
      name: (findFilterValue(next, 'name') as string) || null,
      mechanism: mechanism?.length ? mechanism : null,
    });
  };

  return { columnFilters, onColumnFiltersChange };
}

/** Sortable, paginated table of a Security list whose column filters live elsewhere (such as the URL). */
export function useSecurityListTable<TData extends RowData>(
  data: TData[],
  columns: DataTableColumnDef<TData>[],
  { columnFilters, onColumnFiltersChange }: ColumnFiltersBinding
) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  return useDataTable({
    data,
    columns,
    enableHiding: false,
    enableRowSelection: false,
    state: { sorting, pagination, columnFilters },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnFiltersChange,
    autoResetPageIndex: false,
  });
}

export type SecurityListTableInstance<TData extends RowData> = ReturnType<typeof useSecurityListTable<TData>>;
