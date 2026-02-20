/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { Table } from '@tanstack/react-table';
import { Ellipsis, FilterIcon, FilterXIcon, X } from 'lucide-react';
import React, { isValidElement, memo, useCallback, useEffect, useMemo, useState } from 'react';

import type { FilterModel, FilterOperatorMap, FilterType, FiltersState } from '../lib/filter-utils';
import { getOperatorsForType } from '../lib/filter-utils';
import type { DataTableFilterActions } from '../lib/use-data-table-filter';
import { cn } from '../lib/utils';
import { Button } from './button';
import { Checkbox } from './checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Separator } from './separator';

// ── Types ──────────────────────────────────────────────────────────────

export type FilterOption = {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
};

export type FilterColumnConfig = {
  id: string;
  displayName: string;
  icon?: React.ComponentType<{ className?: string }>;
} & (
  | { type: 'text'; placeholder?: string }
  | { type: 'option'; options?: FilterOption[] }
  | { type: 'multiOption'; options?: FilterOption[] }
);

// ── DataTableFilter (root) ─────────────────────────────────────────────

interface DataTableFilterProps<TData> {
  columns: FilterColumnConfig[];
  filters: FiltersState;
  actions: DataTableFilterActions;
  table?: Table<TData>;
  className?: string;
}

export function DataTableFilter<TData>({
  columns,
  filters,
  actions,
  table,
  className,
}: DataTableFilterProps<TData>) {
  return (
    <div className={cn('flex w-full flex-wrap items-start gap-2', className)}>
      <FilterSelector columns={columns} filters={filters} actions={actions} />
      {filters.map((filter) => {
        const column = columns.find((c) => c.id === filter.columnId);
        if (!column) return null;
        return (
          <ActiveFilter key={filter.columnId} filter={filter} column={column} actions={actions} table={table} />
        );
      })}
      <FilterActions hasFilters={filters.length > 0} actions={actions} />
    </div>
  );
}
DataTableFilter.displayName = 'DataTableFilter';

// ── FilterSelector ─────────────────────────────────────────────────────

interface FilterSelectorProps {
  columns: FilterColumnConfig[];
  filters: FiltersState;
  actions: DataTableFilterActions;
}

const FilterSelector = memo(function FilterSelector({ columns, filters, actions }: FilterSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const hasFilters = filters.length > 0;
  const activeColumnIds = useMemo(() => new Set(filters.map((f) => f.columnId)), [filters]);
  const availableColumns = useMemo(
    () => columns.filter((c) => !activeColumnIds.has(c.id)),
    [columns, activeColumnIds],
  );

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => setSearch(''), 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-7', hasFilters && 'w-fit px-2!')}>
          <FilterIcon className="size-4" />
          {!hasFilters && <span>Filter</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-fit p-0">
        <Command loop>
          <CommandInput value={search} onValueChange={setSearch} placeholder="Search..." />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandList className="max-h-fit">
            <CommandGroup>
              {availableColumns.map((column) => (
                <CommandItem
                  key={column.id}
                  value={column.id}
                  keywords={[column.displayName]}
                  onSelect={() => {
                    actions.addFilter(column.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    {column.icon && <column.icon className="size-4" />}
                    <span>{column.displayName}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
FilterSelector.displayName = 'FilterSelector';

// ── ActiveFilter (segmented pill) ──────────────────────────────────────

interface ActiveFilterProps<TData> {
  filter: FilterModel;
  column: FilterColumnConfig;
  actions: DataTableFilterActions;
  table?: Table<TData>;
}

function ActiveFilter<TData>({ filter, column, actions, table }: ActiveFilterProps<TData>) {
  return (
    <div className="flex h-7 items-center rounded-2xl border border-border bg-background text-xs shadow-xs">
      <FilterSubject column={column} />
      <Separator orientation="vertical" />
      <FilterOperator filter={filter} actions={actions} />
      <Separator orientation="vertical" />
      <FilterValue filter={filter} column={column} actions={actions} table={table} />
      <Separator orientation="vertical" />
      <Button
        variant="ghost"
        className="h-full w-7 rounded-none rounded-r-2xl"
        onClick={() => actions.removeFilter(filter.columnId)}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
ActiveFilter.displayName = 'ActiveFilter';

// ── FilterSubject ──────────────────────────────────────────────────────

function FilterSubject({ column }: { column: FilterColumnConfig }) {
  return (
    <span className="flex select-none items-center gap-1 whitespace-nowrap px-2 font-medium">
      {column.icon && <column.icon className="size-4" />}
      <span>{column.displayName}</span>
    </span>
  );
}
FilterSubject.displayName = 'FilterSubject';

// ── FilterOperator ─────────────────────────────────────────────────────

interface FilterOperatorProps {
  filter: FilterModel;
  actions: DataTableFilterActions;
}

function FilterOperator({ filter, actions }: FilterOperatorProps) {
  const [open, setOpen] = useState(false);

  const operators = getOperatorsForType(filter.type) as FilterOperatorMap<FilterType>;
  const currentOp = operators[filter.operator];
  const currentTarget = currentOp?.target ?? 'single';
  const relatedOperators = Object.values(operators).filter((o) => o.target === currentTarget);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="m-0 h-full w-fit whitespace-nowrap rounded-none p-0 px-2 text-xs">
          <span className="text-muted-foreground">{filter.operator}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-fit p-0">
        <Command loop>
          <CommandList className="max-h-fit">
            <CommandGroup>
              {relatedOperators.map((op) => (
                <CommandItem
                  key={op.value}
                  value={op.value}
                  onSelect={(value) => {
                    actions.setFilterOperator(filter.columnId, value);
                    setOpen(false);
                  }}
                >
                  {op.value}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
FilterOperator.displayName = 'FilterOperator';

// ── FilterValue ────────────────────────────────────────────────────────

interface FilterValueProps<TData> {
  filter: FilterModel;
  column: FilterColumnConfig;
  actions: DataTableFilterActions;
  table?: Table<TData>;
}

const FilterValue = memo(function FilterValue<TData>({
  filter,
  column,
  actions,
  table,
}: FilterValueProps<TData>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="m-0 h-full w-fit whitespace-nowrap rounded-none p-0 px-2 text-xs">
          <FilterValueDisplay filter={filter} column={column} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-fit p-0">
        <FilterValueController filter={filter} column={column} actions={actions} table={table} />
      </PopoverContent>
    </Popover>
  );
}) as <TData>(props: FilterValueProps<TData>) => React.ReactElement;
(FilterValue as { displayName?: string }).displayName = 'FilterValue';

// ── FilterValueDisplay ─────────────────────────────────────────────────

function FilterValueDisplay({ filter, column }: { filter: FilterModel; column: FilterColumnConfig }) {
  if (filter.values.length === 0) return <Ellipsis className="size-4" />;

  switch (column.type) {
    case 'text':
      return <span>{filter.values[0]}</span>;
    case 'option':
    case 'multiOption':
      return <OptionValueDisplay filter={filter} column={column} />;
    default:
      return null;
  }
}

function OptionValueDisplay({
  filter,
  column,
}: {
  filter: FilterModel;
  column: FilterColumnConfig & { type: 'option' | 'multiOption' };
}) {
  const options = column.options ?? [];
  const selected = options.filter((o) => filter.values.includes(o.value));

  if (selected.length === 0 && filter.values.length > 0) {
    return <span>{filter.values.length === 1 ? filter.values[0] : `${filter.values.length} selected`}</span>;
  }

  if (selected.length === 1) {
    const { label, icon: Icon } = selected[0];
    return (
      <span className="inline-flex items-center gap-1">
        {Icon &&
          (isValidElement(Icon) ? Icon : <Icon className="size-4 text-primary" />)}
        <span>{label}</span>
      </span>
    );
  }

  const name = column.displayName.toLowerCase();
  const hasIcons = options.length > 0 && !options.some((o) => !o.icon);

  return (
    <div className="inline-flex items-center gap-0.5">
      {hasIcons &&
        selected.slice(0, 3).map(({ value, icon }) => {
          const Icon = icon!;
          return isValidElement(Icon) ? Icon : <Icon key={value} className="size-4" />;
        })}
      <span className={cn(hasIcons && 'ml-1.5')}>
        {selected.length} {name}
      </span>
    </div>
  );
}

// ── FilterValueController ──────────────────────────────────────────────

function FilterValueController<TData>({
  filter,
  column,
  actions,
  table,
}: {
  filter: FilterModel;
  column: FilterColumnConfig;
  actions: DataTableFilterActions;
  table?: Table<TData>;
}) {
  switch (column.type) {
    case 'text':
      return <TextValueController filter={filter} actions={actions} placeholder={'placeholder' in column ? column.placeholder : undefined} />;
    case 'option':
    case 'multiOption':
      return <OptionValueController filter={filter} column={column} actions={actions} table={table} />;
    default:
      return null;
  }
}

// ── TextValueController ────────────────────────────────────────────────

function TextValueController({
  filter,
  actions,
  placeholder,
}: {
  filter: FilterModel;
  actions: DataTableFilterActions;
  placeholder?: string;
}) {
  const [value, setValue] = useState(filter.values[0] ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      actions.setFilterValues(filter.columnId, value.trim() ? [value] : []);
    }, 200);
    return () => clearTimeout(timer);
  }, [value, filter.columnId, actions]);

  return (
    <div className="p-2">
      <Input
        autoFocus
        placeholder={placeholder ?? 'Search...'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8"
      />
    </div>
  );
}

// ── OptionValueController ──────────────────────────────────────────────

interface OptionItemProps {
  option: FilterOption & { selected: boolean; count?: number };
  onToggle: (value: string, checked: boolean) => void;
}

const OptionItem = memo(function OptionItem({ option, onToggle }: OptionItemProps) {
  const { value, label, icon: Icon, selected, count } = option;

  const handleSelect = useCallback(() => {
    onToggle(value, !selected);
  }, [onToggle, value, selected]);

  return (
    <CommandItem onSelect={handleSelect} className="group flex items-center gap-1.5">
      <Checkbox
        checked={selected}
        className="opacity-0 data-[state=checked]:opacity-100 group-data-[selected=true]:opacity-100 mr-1"
      />
      {Icon &&
        (isValidElement(Icon) ? Icon : <Icon className="size-4 text-primary" />)}
      <span>
        {label}
        {count != null && (
          <sup className={cn('ml-0.5 tabular-nums tracking-tight text-muted-foreground', count === 0 && 'slashed-zero')}>
            {count < 100 ? count : '100+'}
          </sup>
        )}
      </span>
    </CommandItem>
  );
});
OptionItem.displayName = 'OptionItem';

function OptionValueController<TData>({
  filter,
  column,
  actions,
  table,
}: {
  filter: FilterModel;
  column: FilterColumnConfig & { type: 'option' | 'multiOption' };
  actions: DataTableFilterActions;
  table?: Table<TData>;
}) {
  const baseOptions = column.options ?? [];
  const facetedCounts = table?.getColumn(column.id)?.getFacetedUniqueValues();

  const enrichedOptions = useMemo(
    () =>
      baseOptions.map((o) => ({
        ...o,
        selected: filter.values.includes(o.value),
        count: facetedCounts?.get(o.value),
      })),
    [baseOptions, filter.values, facetedCounts],
  );

  const { selectedOptions, unselectedOptions } = useMemo(() => {
    const sel: typeof enrichedOptions = [];
    const unsel: typeof enrichedOptions = [];
    for (const o of enrichedOptions) {
      if (o.selected) sel.push(o);
      else unsel.push(o);
    }
    return { selectedOptions: sel, unselectedOptions: unsel };
  }, [enrichedOptions]);

  const handleToggle = useCallback(
    (value: string, checked: boolean) => {
      if (checked) actions.addFilterValue(filter.columnId, value);
      else actions.removeFilterValue(filter.columnId, value);
    },
    [actions, filter.columnId],
  );

  return (
    <Command loop>
      <CommandInput autoFocus placeholder="Search..." />
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList className="max-h-fit">
        {selectedOptions.length > 0 && (
          <CommandGroup>
            {selectedOptions.map((option) => (
              <OptionItem key={option.value} option={option} onToggle={handleToggle} />
            ))}
          </CommandGroup>
        )}
        {selectedOptions.length > 0 && unselectedOptions.length > 0 && <CommandSeparator />}
        {unselectedOptions.length > 0 && (
          <CommandGroup>
            {unselectedOptions.map((option) => (
              <OptionItem key={option.value} option={option} onToggle={handleToggle} />
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

// ── FilterActions ──────────────────────────────────────────────────────

const FilterActions = memo(function FilterActions({
  hasFilters,
  actions,
}: {
  hasFilters: boolean;
  actions: DataTableFilterActions;
}) {
  return (
    <Button
      className={cn('h-7 px-2!', !hasFilters && 'hidden')}
      variant="destructive"
      onClick={actions.removeAllFilters}
    >
      <FilterXIcon className="size-4" />
      <span>Clear</span>
    </Button>
  );
});
FilterActions.displayName = 'FilterActions';

// ── Re-exports for convenience ─────────────────────────────────────────

export type { FilterModel, FilterType, FiltersState } from '../lib/filter-utils';
export type { DataTableFilterActions } from '../lib/use-data-table-filter';
export { useDataTableFilter } from '../lib/use-data-table-filter';
