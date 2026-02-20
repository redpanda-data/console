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
  CommandSub,
  CommandSubContent,
  CommandSubTrigger,
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
  displayNamePlural?: string;
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
      <FilterSelector columns={columns} filters={filters} actions={actions} table={table} />
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

interface FilterSelectorProps<TData> {
  columns: FilterColumnConfig[];
  filters: FiltersState;
  actions: DataTableFilterActions;
  table?: Table<TData>;
}

const FilterSelector = memo(function FilterSelector<TData>({
  columns,
  filters,
  actions,
  table,
}: FilterSelectorProps<TData>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

  const hasFilters = filters.length > 0;

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setSearch('');
        setActiveColumnId(null);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Hierarchical search: match option values across all columns
  const matchingOptions = useMemo(() => {
    if (!search || activeColumnId) return [];
    const term = search.toLowerCase();
    const matches: Array<{
      columnId: string;
      columnDisplayName: string;
      columnIcon?: React.ComponentType<{ className?: string }>;
      option: FilterOption;
      count?: number;
    }> = [];
    for (const col of columns) {
      if (col.type === 'text' || !('options' in col) || !col.options) continue;
      const facetedCounts = table?.getColumn(col.id)?.getFacetedUniqueValues();
      for (const opt of col.options) {
        if (opt.label.toLowerCase().includes(term)) {
          matches.push({
            columnId: col.id,
            columnDisplayName: col.displayName,
            columnIcon: col.icon,
            option: opt,
            count: facetedCounts?.get(opt.value),
          });
        }
      }
    }
    return matches;
  }, [search, activeColumnId, columns, table]);

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
              {columns.map((column) => {
                const filter = filters.find((f) => f.columnId === column.id);
                return (
                  <CommandSub
                    key={column.id}
                    open={activeColumnId === column.id}
                    onOpenChange={(isOpen) => setActiveColumnId(isOpen ? column.id : null)}
                  >
                    <CommandSubTrigger value={column.id} keywords={[column.displayName]}>
                      <div className="flex items-center gap-1.5">
                        {column.icon && <column.icon className="size-4" />}
                        <span>{column.displayName}</span>
                      </div>
                    </CommandSubTrigger>
                    <CommandSubContent>
                      <FilterKeySubmenu
                        column={column}
                        selectedValues={filter?.values ?? []}
                        actions={actions}
                        table={table}
                      />
                    </CommandSubContent>
                  </CommandSub>
                );
              })}
            </CommandGroup>
            {matchingOptions.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {matchingOptions.map((match) => {
                    const { icon: Icon } = match.option;
                    const ColIcon = match.columnIcon;
                    const selectedValues = filters.find((f) => f.columnId === match.columnId)?.values ?? [];
                    const isSelected = selectedValues.includes(match.option.value);
                    return (
                      <CommandItem
                        key={`${match.columnId}:${match.option.value}`}
                        value={`${match.columnId}:${match.option.value}`}
                        keywords={[match.option.label, match.columnDisplayName]}
                        onSelect={() => {
                          if (isSelected) {
                            actions.removeFilterValue(match.columnId, match.option.value);
                          } else {
                            actions.addFilterValue(match.columnId, match.option.value);
                          }
                          setOpen(false);
                        }}
                        className="group flex items-center gap-1.5"
                      >
                        <Checkbox
                          checked={isSelected}
                          className="opacity-0 data-[state=checked]:opacity-100 group-data-[selected=true]:opacity-100 mr-1"
                        />
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          {ColIcon && <ColIcon className="size-3.5" />}
                          <span>{match.columnDisplayName}</span>
                          <span>&gt;</span>
                        </span>
                        {Icon &&
                          (isValidElement(Icon) ? Icon : <Icon className="size-4 text-primary" />)}
                        <span>
                          {match.option.label}
                          {match.count != null && (
                            <sup className={cn('ml-0.5 tabular-nums tracking-tight text-muted-foreground', match.count === 0 && 'slashed-zero')}>
                              {match.count < 100 ? match.count : '100+'}
                            </sup>
                          )}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}) as <TData>(props: FilterSelectorProps<TData>) => React.ReactElement;
(FilterSelector as { displayName?: string }).displayName = 'FilterSelector';

// ── FilterKeySubmenu ────────────────────────────────────────────────────

function FilterKeySubmenu<TData>({
  column,
  selectedValues,
  actions,
  table,
}: {
  column: FilterColumnConfig;
  selectedValues: string[];
  actions: DataTableFilterActions;
  table?: Table<TData>;
}) {
  switch (column.type) {
    case 'text':
      return (
        <TextValueController
          columnId={column.id}
          initialValue={selectedValues[0] ?? ''}
          actions={actions}
          placeholder={'placeholder' in column ? column.placeholder : undefined}
        />
      );
    case 'option':
    case 'multiOption':
      return (
        <OptionValueController
          columnId={column.id}
          selectedValues={selectedValues}
          column={column}
          actions={actions}
          table={table}
        />
      );
    default:
      return null;
  }
}

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

  const name = (column.displayNamePlural ?? `${column.displayName}s`).toLowerCase();
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
      return <TextValueController columnId={filter.columnId} initialValue={filter.values[0] ?? ''} actions={actions} placeholder={'placeholder' in column ? column.placeholder : undefined} />;
    case 'option':
    case 'multiOption':
      return <OptionValueController columnId={filter.columnId} selectedValues={filter.values} column={column} actions={actions} table={table} />;
    default:
      return null;
  }
}

// ── TextValueController ────────────────────────────────────────────────

function TextValueController({
  columnId,
  initialValue,
  actions,
  placeholder,
}: {
  columnId: string;
  initialValue: string;
  actions: DataTableFilterActions;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const timer = setTimeout(() => {
      actions.setFilterValues(columnId, value.trim() ? [value] : []);
    }, 200);
    return () => clearTimeout(timer);
  }, [value, columnId, actions]);

  return (
    <div className="p-2">
      <Input
        autoFocus
        placeholder={placeholder ?? 'Search...'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
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
  columnId,
  selectedValues,
  column,
  actions,
  table,
}: {
  columnId: string;
  selectedValues: string[];
  column: FilterColumnConfig & { type: 'option' | 'multiOption' };
  actions: DataTableFilterActions;
  table?: Table<TData>;
}) {
  const baseOptions = column.options ?? [];
  const facetedCounts = table?.getColumn(columnId)?.getFacetedUniqueValues();

  const enrichedOptions = useMemo(
    () =>
      baseOptions.map((o) => ({
        ...o,
        selected: selectedValues.includes(o.value),
        count: facetedCounts?.get(o.value),
      })),
    [baseOptions, selectedValues, facetedCounts],
  );

  const handleToggle = useCallback(
    (value: string, checked: boolean) => {
      if (checked) actions.addFilterValue(columnId, value);
      else actions.removeFilterValue(columnId, value);
    },
    [actions, columnId],
  );

  return (
    <Command loop>
      <CommandInput autoFocus placeholder="Search..." />
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList className="max-h-fit">
        <CommandGroup>
          {enrichedOptions.map((option) => (
            <OptionItem key={option.value} option={option} onToggle={handleToggle} />
          ))}
        </CommandGroup>
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
