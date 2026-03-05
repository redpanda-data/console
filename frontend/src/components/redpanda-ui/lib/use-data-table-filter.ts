import type { Table } from '@tanstack/react-table';
import { useEffect, useMemo } from 'react';

import type { FilterColumnConfig } from '../components/data-table-filter';
import { useControllableState } from './use-controllable-state';
import {
  determineNewOperator,
  type FilterModel,
  type FiltersState,
  type FilterType,
  getDefaultOperator,
} from './filter-utils';

export type DataTableFilterActions = {
  addFilter: (columnId: string) => void;
  removeFilter: (columnId: string) => void;
  removeAllFilters: () => void;
  setFilterValues: (columnId: string, values: string[]) => void;
  addFilterValue: (columnId: string, value: string) => void;
  removeFilterValue: (columnId: string, value: string) => void;
  setFilterOperator: (columnId: string, operator: string) => void;
};

export type UseDataTableFilterOptions<TData> = {
  columns: FilterColumnConfig[];
  table?: Table<TData>;
  value?: FiltersState;
  onValueChange?: (filters: FiltersState) => void;
  defaultValue?: FiltersState;
};

function computeSetFilterValues(
  prev: FiltersState,
  columnId: string,
  values: string[],
  type: FilterType
): FiltersState {
  const filter = prev.find((f) => f.columnId === columnId);

  if (!filter) {
    if (values.length === 0) {
      return prev;
    }
    return [
      ...prev,
      {
        columnId,
        type,
        operator: getDefaultOperator(type, values.length > 1 ? 'multiple' : 'single'),
        values,
      },
    ];
  }

  if (values.length === 0) {
    return prev.filter((f) => f.columnId !== columnId);
  }

  const newOperator = determineNewOperator(type, filter.values, values, filter.operator);
  return prev.map((f) => (f.columnId === columnId ? { columnId, type, operator: newOperator, values } : f));
}

export function useDataTableFilter<TData>({
  columns,
  table,
  value: valueProp,
  onValueChange,
  defaultValue,
}: UseDataTableFilterOptions<TData>) {
  const [filters, setFilters] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue ?? [],
    onChange: onValueChange,
    caller: 'useDataTableFilter',
  });

  const columnsMap = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const actions: DataTableFilterActions = useMemo(
    () => ({
      addFilter(columnId: string) {
        setFilters((prev) => {
          if (prev.some((f) => f.columnId === columnId)) {
            return prev;
          }
          const type = columnsMap.get(columnId)?.type ?? 'text';
          return [
            ...prev,
            {
              columnId,
              type,
              operator: getDefaultOperator(type),
              values: [],
            },
          ];
        });
      },

      removeFilter(columnId: string) {
        setFilters((prev) => prev.filter((f) => f.columnId !== columnId));
      },

      removeAllFilters() {
        setFilters([]);
      },

      setFilterValues(columnId: string, values: string[]) {
        setFilters((prev) => {
          const type = columnsMap.get(columnId)?.type ?? 'text';
          return computeSetFilterValues(prev, columnId, values, type);
        });
      },

      addFilterValue(columnId: string, value: string) {
        setFilters((prev) => {
          const type = columnsMap.get(columnId)?.type ?? 'text';
          const filter = prev.find((f) => f.columnId === columnId);

          if (!filter || filter.values.length === 0) {
            if (!filter) {
              return [
                ...prev,
                {
                  columnId,
                  type,
                  operator: getDefaultOperator(type),
                  values: [value],
                },
              ];
            }
            return prev.map((f) =>
              f.columnId === columnId ? { ...f, values: [value], operator: getDefaultOperator(type) } : f
            );
          }

          if (filter.values.includes(value)) {
            return prev;
          }

          const oldValues = filter.values;
          const newValues = [...oldValues, value];
          const newOperator = determineNewOperator(type, oldValues, newValues, filter.operator);

          return prev.map((f) =>
            f.columnId === columnId ? { columnId, type, operator: newOperator, values: newValues } : f
          );
        });
      },

      removeFilterValue(columnId: string, value: string) {
        setFilters((prev) => {
          const type = columnsMap.get(columnId)?.type ?? 'text';
          const filter = prev.find((f) => f.columnId === columnId);

          if (!filter) {
            return prev;
          }

          const oldValues = filter.values;
          const newValues = oldValues.filter((v) => v !== value);

          if (newValues.length === 0) {
            return prev.filter((f) => f.columnId !== columnId);
          }

          const newOperator = determineNewOperator(type, oldValues, newValues, filter.operator);

          return prev.map((f) =>
            f.columnId === columnId ? { columnId, type, operator: newOperator, values: newValues } : f
          );
        });
      },

      setFilterOperator(columnId: string, operator: string) {
        setFilters((prev) => prev.map((f) => (f.columnId === columnId ? { ...f, operator } : f)));
      },
    }),
    [columnsMap, setFilters]
  );

  // Sync filters → TanStack Table column filter values
  useEffect(() => {
    if (!table) {
      return;
    }

    for (const col of columns) {
      const tableColumn = table.getColumn(col.id);
      if (!tableColumn) {
        continue;
      }

      const filter = filters.find((f) => f.columnId === col.id);
      const currentValue = tableColumn.getFilterValue() as FilterModel | undefined;

      if (filter) {
        tableColumn.setFilterValue(filter);
      } else if (currentValue !== null) {
        tableColumn.setFilterValue(undefined);
      }
    }
  }, [table, columns, filters]);

  return { columns, filters, actions };
}
