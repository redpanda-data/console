import type { Table } from '@tanstack/react-table';
import { Ellipsis, FilterIcon, X } from 'lucide-react';
import React, { isValidElement, memo, useCallback, useEffect, useMemo, useState } from 'react';

import { badgeVariants } from './badge';
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
import type { DataTableFilterActions } from '../lib/use-data-table-filter';
import type { FilterModel, FilterOperatorMap, FiltersState, FilterType } from '../lib/filter-utils';
import { getOperatorsForType } from '../lib/filter-utils';
import { cn } from '../lib/utils';

// ── Types ──────────────────────────────────────────────────────────────

export type DataTableFilterVariant =
  | 'neutral'
  | 'neutral-inverted'
  | 'neutral-outline'
  | 'simple'
  | 'simple-inverted'
  | 'simple-outline'
  | 'disabled'
  | 'disabled-outline'
  | 'outline'
  | 'primary-inverted'
  | 'primary-outline'
  | 'secondary'
  | 'secondary-inverted'
  | 'secondary-outline';

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

// ── Helpers ─────────────────────────────────────────────────────────────

type MatchingOption = {
  columnId: string;
  columnDisplayName: string;
  columnIcon?: React.ComponentType<{ className?: string }>;
  option: FilterOption;
  count?: number;
};

function collectMatchingOptions<TData>(
  columns: FilterColumnConfig[],
  term: string,
  table?: Table<TData>
): MatchingOption[] {
  const results: MatchingOption[] = [];
  for (const col of columns) {
    if (col.type === 'text' || !('options' in col) || !col.options) {
      continue;
    }
    const facetedCounts = table?.getColumn(col.id)?.getFacetedUniqueValues();
    for (const opt of col.options) {
      if (opt.label.toLowerCase().includes(term)) {
        results.push({
          columnId: col.id,
          columnDisplayName: col.displayName,
          columnIcon: col.icon,
          option: opt,
          count: facetedCounts?.get(opt.value),
        });
      }
    }
  }
  return results;
}

function renderIcon(icon: React.ComponentType<{ className?: string }> | undefined, className: string) {
  if (!icon) {
    return null;
  }
  const Icon = icon;
  return isValidElement(Icon) ? Icon : <Icon className={className} />;
}

// ── DataTableFilter (root) ─────────────────────────────────────────────

type DataTableFilterProps<TData> = {
  columns: FilterColumnConfig[];
  filters: FiltersState;
  actions: DataTableFilterActions;
  table?: Table<TData>;
  className?: string;
  variant?: DataTableFilterVariant;
};

export function DataTableFilter<TData>({
  columns,
  filters,
  actions,
  table,
  className,
  variant = 'primary-inverted',
}: DataTableFilterProps<TData>) {
  return (
    <div className={cn('flex w-full flex-wrap items-center gap-2', className)}>
      <FilterSelector actions={actions} columns={columns} filters={filters} table={table} variant={variant} />
      {filters.map((filter) => {
        const col = columns.find((c) => c.id === filter.columnId);
        if (!col) {
          return null;
        }
        return (
          <ActiveFilter
            actions={actions}
            column={col}
            filter={filter}
            key={filter.columnId}
            table={table}
            variant={variant}
          />
        );
      })}
      <FilterActions actions={actions} hasFilters={filters.length > 0} variant={variant} />
    </div>
  );
}
DataTableFilter.displayName = 'DataTableFilter';

// ── MatchingOptionItem ─────────────────────────────────────────────────

function MatchingOptionItem({
  match,
  isSelected,
  onSelect,
}: {
  match: MatchingOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { icon: MatchIcon } = match.option;
  const ColIcon = match.columnIcon;
  return (
    <CommandItem
      className="group flex items-center gap-1.5"
      keywords={[match.option.label, match.columnDisplayName]}
      onSelect={onSelect}
      value={`${match.columnId}:${match.option.value}`}
    >
      <Checkbox
        checked={isSelected}
        className="mr-1 opacity-0 data-[state=checked]:opacity-100 group-data-[selected=true]:opacity-100"
      />
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {ColIcon ? <ColIcon className="size-3.5" /> : null}
        <span>{match.columnDisplayName}</span>
        <span>&gt;</span>
      </span>
      {MatchIcon ? renderIcon(MatchIcon, 'size-4 text-primary') : null}
      <span>
        {match.option.label}
        {match.count !== undefined ? (
          <sup
            className={cn(
              'ml-0.5 text-muted-foreground tabular-nums tracking-tight',
              match.count === 0 ? 'slashed-zero' : undefined
            )}
          >
            {match.count < 100 ? match.count : '100+'}
          </sup>
        ) : null}
      </span>
    </CommandItem>
  );
}

// ── FilterSelector ─────────────────────────────────────────────────────

type FilterSelectorProps<TData> = {
  columns: FilterColumnConfig[];
  filters: FiltersState;
  actions: DataTableFilterActions;
  table?: Table<TData>;
  variant?: DataTableFilterVariant;
};

const FilterSelector = memo(function FilterSelectorImpl<TData>({
  columns,
  filters,
  actions,
  table,
  variant = 'primary-inverted',
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
    if (!search || activeColumnId) {
      return [];
    }
    return collectMatchingOptions(columns, search.toLowerCase(), table);
  }, [search, activeColumnId, columns, table]);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            'h-7',
            hasFilters ? 'w-fit px-2!' : undefined,
            variant ? badgeVariants({ variant }) : undefined
          )}
          variant="ghost"
        >
          <FilterIcon className="size-4" />
          {hasFilters ? null : <span>Filter</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-fit p-0" side="bottom">
        <Command loop>
          <CommandInput onValueChange={setSearch} placeholder="Search..." value={search} />
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandList className="max-h-fit">
            <CommandGroup>
              {columns.map((col) => {
                const filter = filters.find((f) => f.columnId === col.id);
                return (
                  <CommandSub
                    key={col.id}
                    onOpenChange={(isOpen) => setActiveColumnId(isOpen ? col.id : null)}
                    open={activeColumnId === col.id}
                  >
                    <CommandSubTrigger keywords={[col.displayName]} value={col.id}>
                      <div className="flex items-center gap-1.5">
                        {col.icon ? <col.icon className="size-4" /> : null}
                        <span>{col.displayName}</span>
                      </div>
                    </CommandSubTrigger>
                    <CommandSubContent>
                      <FilterKeySubmenu
                        actions={actions}
                        filterColumn={col}
                        selectedValues={filter?.values ?? []}
                        table={table}
                      />
                    </CommandSubContent>
                  </CommandSub>
                );
              })}
            </CommandGroup>
            {matchingOptions.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  {matchingOptions.map((match) => {
                    const selectedValues = filters.find((f) => f.columnId === match.columnId)?.values ?? [];
                    const isSelected = selectedValues.includes(match.option.value);
                    return (
                      <MatchingOptionItem
                        isSelected={isSelected}
                        key={`${match.columnId}:${match.option.value}`}
                        match={match}
                        onSelect={() => {
                          if (isSelected) {
                            actions.removeFilterValue(match.columnId, match.option.value);
                          } else {
                            actions.addFilterValue(match.columnId, match.option.value);
                          }
                          setOpen(false);
                        }}
                      />
                    );
                  })}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}) as <TData>(props: FilterSelectorProps<TData>) => React.ReactElement;
(FilterSelector as { displayName?: string }).displayName = 'FilterSelector';

// ── FilterKeySubmenu ────────────────────────────────────────────────────

function FilterKeySubmenu<TData>({
  filterColumn,
  selectedValues,
  actions,
  table,
}: {
  filterColumn: FilterColumnConfig;
  selectedValues: string[];
  actions: DataTableFilterActions;
  table?: Table<TData>;
}) {
  switch (filterColumn.type) {
    case 'text':
      return (
        <TextValueController
          actions={actions}
          columnId={filterColumn.id}
          initialValue={selectedValues[0] ?? ''}
          placeholder={'placeholder' in filterColumn ? filterColumn.placeholder : undefined}
        />
      );
    case 'option':
    case 'multiOption':
      return (
        <OptionValueController
          actions={actions}
          columnId={filterColumn.id}
          filterColumn={filterColumn}
          selectedValues={selectedValues}
          table={table}
        />
      );
    default:
      return null;
  }
}

// ── ActiveFilter (segmented pill) ──────────────────────────────────────

type ActiveFilterProps<TData> = {
  filter: FilterModel;
  column: FilterColumnConfig;
  actions: DataTableFilterActions;
  table?: Table<TData>;
  variant?: DataTableFilterVariant;
};

function ActiveFilter<TData>({
  filter,
  column: col,
  actions,
  table,
  variant = 'primary-inverted',
}: ActiveFilterProps<TData>) {
  return (
    <div
      className={cn(
        badgeVariants({ variant: variant ?? 'neutral-inverted' }),
        'flex h-7 items-center rounded-2xl text-xs shadow-xs'
      )}
    >
      <FilterSubject filterColumn={col} />
      <Separator orientation="vertical" />
      <FilterOperator actions={actions} filter={filter} />
      <Separator orientation="vertical" />
      <FilterValue actions={actions} filter={filter} filterColumn={col} table={table} />
      <Separator orientation="vertical" />
      <Button
        className="h-full w-7 rounded-none rounded-r-2xl text-current hover:bg-dark-alpha-subtle active:bg-dark-alpha-default"
        onClick={() => actions.removeFilter(filter.columnId)}
        variant="ghost"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
ActiveFilter.displayName = 'ActiveFilter';

// ── FilterSubject ──────────────────────────────────────────────────────

function FilterSubject({ filterColumn }: { filterColumn: FilterColumnConfig }) {
  return (
    <span className="flex select-none items-center gap-1 whitespace-nowrap px-2 font-medium opacity-75">
      {filterColumn.icon ? <filterColumn.icon className="size-4" /> : null}
      <span>{filterColumn.displayName}</span>
    </span>
  );
}
FilterSubject.displayName = 'FilterSubject';

// ── FilterOperator ─────────────────────────────────────────────────────

type FilterOperatorProps = {
  filter: FilterModel;
  actions: DataTableFilterActions;
};

function FilterOperator({ filter, actions }: FilterOperatorProps) {
  const [open, setOpen] = useState(false);

  const operators = getOperatorsForType(filter.type) as FilterOperatorMap<FilterType>;
  const currentOp = operators[filter.operator];
  const currentTarget = currentOp?.target ?? 'single';
  const relatedOperators = Object.values(operators).filter((o) => o.target === currentTarget);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="m-0 h-full w-fit whitespace-nowrap rounded-none p-0 px-2 text-current text-xs hover:bg-dark-alpha-subtle active:bg-dark-alpha-default"
          variant="ghost"
        >
          <span className="opacity-80">{filter.operator}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-fit p-0">
        <Command loop>
          <CommandList className="max-h-fit">
            <CommandGroup>
              {relatedOperators.map((op) => (
                <CommandItem
                  key={op.value}
                  onSelect={(val) => {
                    actions.setFilterOperator(filter.columnId, val);
                    setOpen(false);
                  }}
                  value={op.value}
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

type FilterValueProps<TData> = {
  filter: FilterModel;
  filterColumn: FilterColumnConfig;
  actions: DataTableFilterActions;
  table?: Table<TData>;
};

const FilterValue = memo(function FilterValueImpl<TData>({
  filter,
  filterColumn,
  actions,
  table,
}: FilterValueProps<TData>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className="m-0 h-full w-fit whitespace-nowrap rounded-none p-0 px-2 text-current text-xs hover:bg-dark-alpha-subtle active:bg-dark-alpha-default"
          variant="ghost"
        >
          <FilterValueDisplay filter={filter} filterColumn={filterColumn} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-fit p-0" side="bottom">
        <FilterValueController actions={actions} filter={filter} filterColumn={filterColumn} table={table} />
      </PopoverContent>
    </Popover>
  );
}) as <TData>(props: FilterValueProps<TData>) => React.ReactElement;
(FilterValue as { displayName?: string }).displayName = 'FilterValue';

// ── FilterValueDisplay ─────────────────────────────────────────────────

function FilterValueDisplay({ filter, filterColumn }: { filter: FilterModel; filterColumn: FilterColumnConfig }) {
  if (filter.values.length === 0) {
    return <Ellipsis className="size-4" />;
  }

  switch (filterColumn.type) {
    case 'text':
      return <span>{filter.values[0]}</span>;
    case 'option':
    case 'multiOption':
      return <OptionValueDisplay filter={filter} filterColumn={filterColumn} />;
    default:
      return null;
  }
}

function OptionValueDisplay({
  filter,
  filterColumn,
}: {
  filter: FilterModel;
  filterColumn: FilterColumnConfig & { type: 'option' | 'multiOption' };
}) {
  const options = filterColumn.options ?? [];
  const selected = options.filter((o) => filter.values.includes(o.value));

  if (selected.length === 0 && filter.values.length > 0) {
    return <span>{filter.values.length === 1 ? filter.values[0] : `${filter.values.length} selected`}</span>;
  }

  if (selected.length === 1) {
    const { label, icon: ItemIcon } = selected[0];
    return (
      <span className="inline-flex items-center gap-1">
        {ItemIcon ? renderIcon(ItemIcon, 'size-4') : null}
        <span>{label}</span>
      </span>
    );
  }

  const name = (filterColumn.displayNamePlural ?? `${filterColumn.displayName}s`).toLowerCase();
  const hasIcons = options.length > 0 && !options.some((o) => !o.icon);

  return (
    <div className="inline-flex items-center gap-0.5">
      {hasIcons
        ? selected.slice(0, 3).map(({ value, icon }) => {
            if (!icon) {
              return null;
            }
            return renderIcon(icon, 'size-4') ?? <span key={value} />;
          })
        : null}
      <span className={cn(hasIcons ? 'ml-1.5' : undefined)}>
        {selected.length} {name}
      </span>
    </div>
  );
}

// ── FilterValueController ──────────────────────────────────────────────

function FilterValueController<TData>({
  filter,
  filterColumn,
  actions,
  table,
}: {
  filter: FilterModel;
  filterColumn: FilterColumnConfig;
  actions: DataTableFilterActions;
  table?: Table<TData>;
}) {
  switch (filterColumn.type) {
    case 'text':
      return (
        <TextValueController
          actions={actions}
          columnId={filter.columnId}
          initialValue={filter.values[0] ?? ''}
          placeholder={'placeholder' in filterColumn ? filterColumn.placeholder : undefined}
        />
      );
    case 'option':
    case 'multiOption':
      return (
        <OptionValueController
          actions={actions}
          columnId={filter.columnId}
          filterColumn={filterColumn}
          selectedValues={filter.values}
          table={table}
        />
      );
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
        className="h-8"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
          }
        }}
        placeholder={placeholder ?? 'Search...'}
        value={value}
      />
    </div>
  );
}

// ── OptionValueController ──────────────────────────────────────────────

type OptionItemProps = {
  option: FilterOption & { selected: boolean; count?: number };
  onToggle: (value: string, checked: boolean) => void;
};

const OptionItem = memo(function OptionItemImpl({ option, onToggle }: OptionItemProps) {
  const { value, label, icon: ItemIcon, selected, count } = option;

  const handleSelect = useCallback(() => {
    onToggle(value, !selected);
  }, [onToggle, value, selected]);

  return (
    <CommandItem className="group flex items-center gap-1.5" onSelect={handleSelect}>
      <Checkbox
        checked={selected}
        className="mr-1 opacity-0 data-[state=checked]:opacity-100 group-data-[selected=true]:opacity-100"
      />
      {ItemIcon ? renderIcon(ItemIcon, 'size-4 text-primary') : null}
      <span>
        {label}
        {count !== undefined ? (
          <sup
            className={cn(
              'ml-0.5 text-muted-foreground tabular-nums tracking-tight',
              count === 0 ? 'slashed-zero' : undefined
            )}
          >
            {count < 100 ? count : '100+'}
          </sup>
        ) : null}
      </span>
    </CommandItem>
  );
});
OptionItem.displayName = 'OptionItem';

function OptionValueController<TData>({
  columnId,
  selectedValues,
  filterColumn,
  actions,
  table,
}: {
  columnId: string;
  selectedValues: string[];
  filterColumn: FilterColumnConfig & { type: 'option' | 'multiOption' };
  actions: DataTableFilterActions;
  table?: Table<TData>;
}) {
  const baseOptions = filterColumn.options ?? [];
  const facetedCounts = table?.getColumn(columnId)?.getFacetedUniqueValues();

  const enrichedOptions = useMemo(
    () =>
      baseOptions.map((o) => ({
        ...o,
        selected: selectedValues.includes(o.value),
        count: facetedCounts?.get(o.value),
      })),
    [baseOptions, selectedValues, facetedCounts]
  );

  const handleToggle = useCallback(
    (val: string, checked: boolean) => {
      if (checked) {
        actions.addFilterValue(columnId, val);
      } else {
        actions.removeFilterValue(columnId, val);
      }
    },
    [actions, columnId]
  );

  return (
    <Command loop>
      <CommandInput autoFocus placeholder="Search..." />
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList className="max-h-fit">
        <CommandGroup>
          {enrichedOptions.map((option) => (
            <OptionItem key={option.value} onToggle={handleToggle} option={option} />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

// ── FilterActions ──────────────────────────────────────────────────────

const FilterActions = memo(function FilterActionsImpl({
  hasFilters,
  actions,
  variant = 'primary-inverted',
}: {
  hasFilters: boolean;
  actions: DataTableFilterActions;
  variant?: DataTableFilterVariant;
}) {
  return (
    <Button
      className={cn('h-7 px-2!', variant ? badgeVariants({ variant }) : undefined, hasFilters ? undefined : 'hidden')}
      onClick={actions.removeAllFilters}
      variant="ghost"
    >
      <span>Clear</span>
    </Button>
  );
});
FilterActions.displayName = 'FilterActions';
