// Copyright 2026 Redpanda Data, Inc.

import type { RowData } from '@tanstack/react-table';
import { Ellipsis, FilterIcon, X } from 'lucide-react';
import type React from 'react';
import { isValidElement, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { BadgeEmphasis, BadgeTone } from './badge';
import { badgeVariants } from './badge/variants';
import { CheckboxView } from './checkbox';
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
import type { DataTableInstance as Table } from './data-table';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Separator } from './separator';
import type { DataTableFilterActions } from '../lib/use-data-table-filter';
import type { FilterModel, FiltersState } from '../lib/filter-utils';
import { getOperatorsForType } from '../lib/filter-utils';
import { cn } from '../lib/utils';
import { omitUndefined } from '../lib/utils/omit-undefined';
import { FacetedControl } from './data-table-filter/faceted-control';

/** Emphasis applied to filter controls and active chips. */
export type DataTableFilterVariant = BadgeEmphasis;

export interface FilterOption {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

export type FilterColumnConfig = {
  id: string;
  displayName: string;
  displayNamePlural?: string;
  icon?: React.ComponentType<{ className?: string }>;
} & (
  | { type: 'text'; placeholder?: string }
  | { type: 'option'; options?: FilterOption[]; mode?: 'single' | 'multiple' }
  | { type: 'multiOption'; options?: FilterOption[] }
);

interface MatchingOption {
  columnDisplayName: string;
  columnIcon?: React.ComponentType<{ className?: string }>;
  columnId: string;
  count?: number;
  option: FilterOption;
}

function collectMatchingOptions<TData extends RowData>(
  columns: FilterColumnConfig[],
  term: string,
  table?: Table<TData>
): MatchingOption[] {
  const results: MatchingOption[] = [];
  for (const col of columns) {
    if (col.type === 'text' || col.options === undefined) {
      continue;
    }
    const facetedCounts = table?.getColumn(col.id)?.getFacetedUniqueValues();
    for (const opt of col.options) {
      if (opt.label.toLowerCase().includes(term)) {
        results.push(
          omitUndefined({
            columnId: col.id,
            columnDisplayName: col.displayName,
            columnIcon: col.icon,
            option: opt,
            count: facetedCounts?.get(opt.value),
          })
        );
      }
    }
  }
  return results;
}

function renderIcon(icon: React.ComponentType<{ className?: string }> | undefined, className: string) {
  if (icon === undefined) {
    return null;
  }
  const Icon = icon;
  return isValidElement(Icon) ? Icon : <Icon className={className} />;
}

function RadioIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mr-1 flex size-4 shrink-0 items-center justify-center rounded-full border border-primary',
        checked ? 'opacity-100' : 'opacity-0 group-data-[selected=true]:opacity-100'
      )}
    >
      {checked ? <span className="size-2 rounded-full bg-primary" /> : null}
    </span>
  );
}

interface DataTableFilterProps<TData extends RowData> {
  actions: DataTableFilterActions;
  className?: string | undefined;
  columns: FilterColumnConfig[];
  filters: FiltersState;
  table?: Table<TData> | undefined;
  tone?: BadgeTone | undefined;
  variant?: DataTableFilterVariant | undefined;
}

export function DataTableFilter<TData extends RowData>({
  columns,
  filters,
  actions,
  table,
  className,
  tone = 'primary',
  variant = 'subtle',
}: DataTableFilterProps<TData>) {
  return (
    <div className={cn('flex w-full flex-wrap items-center gap-2', className)}>
      <FilterSelector
        actions={actions}
        columns={columns}
        filters={filters}
        table={table}
        tone={tone}
        variant={variant}
      />
      {filters.map((filter) => {
        const col = columns.find((c) => c.id === filter.columnId);
        if (col === undefined) {
          return null;
        }
        return (
          <ActiveFilter
            actions={actions}
            column={col}
            filter={filter}
            key={filter.columnId}
            table={table}
            tone={tone}
            variant={variant}
          />
        );
      })}
      <FilterActions actions={actions} hasFilters={filters.length > 0} tone={tone} variant={variant} />
    </div>
  );
}
DataTableFilter.displayName = 'DataTableFilter';

function MatchingOptionItem({
  match,
  isSelected,
  onSelect,
  singleMode,
}: {
  match: MatchingOption;
  isSelected: boolean;
  onSelect: () => void;
  singleMode?: boolean | undefined;
}) {
  const { icon: MatchIcon } = match.option;
  const ColIcon = match.columnIcon;
  return (
    <CommandItem
      aria-description={isSelected ? 'Included in filter' : 'Not included in filter'}
      className="group"
      keywords={[match.option.label, match.columnDisplayName]}
      onSelect={onSelect}
      value={`${match.columnId}:${match.option.value}`}
    >
      {singleMode === true ? (
        <RadioIndicator checked={isSelected} />
      ) : (
        <CheckboxView
          checked={isSelected}
          className="invisible mr-1 group-data-[selected=true]:visible data-[state=checked]:visible"
        />
      )}
      <span className="inline-flex items-center gap-1 text-subtle">
        {ColIcon === undefined ? null : <ColIcon className="size-3.5" />}
        <span>{match.columnDisplayName}</span>
        <span>&gt;</span>
      </span>
      {MatchIcon === undefined ? null : renderIcon(MatchIcon, 'size-4 text-primary')}
      <span>
        {match.option.label}
        {match.count === undefined ? null : (
          <sup
            className={cn(
              'ml-0.5 tracking-tight text-subtle tabular-nums',
              match.count === 0 ? 'slashed-zero' : undefined
            )}
          >
            {match.count < 100 ? match.count : '100+'}
          </sup>
        )}
      </span>
    </CommandItem>
  );
}

interface FilterSelectorProps<TData extends RowData> {
  actions: DataTableFilterActions;
  columns: FilterColumnConfig[];
  filters: FiltersState;
  table?: Table<TData> | undefined;
  tone?: BadgeTone | undefined;
  variant?: DataTableFilterVariant | undefined;
}

function FilterSelector<TData extends RowData>({
  columns,
  filters,
  actions,
  table,
  tone = 'primary',
  variant = 'subtle',
}: FilterSelectorProps<TData>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);

  const hasFilters = filters.length > 0;

  useEffect((): (() => void) | undefined => {
    if (!open) {
      const timer = setTimeout(() => {
        setSearch('');
        setActiveColumnId(null);
      }, 150);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [open]);

  const matchingOptions =
    search === '' || (activeColumnId !== null && activeColumnId !== '')
      ? []
      : collectMatchingOptions(columns, search.toLowerCase(), table);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <FacetedControl aria-label="Add filter" kind="add" tone={tone} variant={variant}>
            <FilterIcon className="size-4" />
            {hasFilters ? null : <span>Filter</span>}
          </FacetedControl>
        }
      />
      <PopoverContent align="start" className="w-fit" padding="none" side="bottom">
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
                    onOpenChange={(isOpen) => {
                      setActiveColumnId(isOpen ? col.id : null);
                    }}
                    open={activeColumnId === col.id}
                  >
                    <CommandSubTrigger keywords={[col.displayName]} value={col.id}>
                      <div className="flex items-center gap-1.5">
                        {col.icon === undefined ? null : <col.icon className="size-4" />}
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
                    const col = columns.find((c) => c.id === match.columnId);
                    const singleMode = col?.type === 'option' && col.mode === 'single';
                    const selectedValues = filters.find((f) => f.columnId === match.columnId)?.values ?? [];
                    const isSelected = selectedValues.includes(match.option.value);
                    return (
                      <MatchingOptionItem
                        isSelected={isSelected}
                        key={`${match.columnId}:${match.option.value}`}
                        match={match}
                        onSelect={() => {
                          if (singleMode) {
                            if (!isSelected) {
                              actions.setFilterValues(match.columnId, [match.option.value]);
                            }
                          } else if (isSelected) {
                            actions.removeFilterValue(match.columnId, match.option.value);
                          } else {
                            actions.addFilterValue(match.columnId, match.option.value);
                          }
                          setOpen(false);
                        }}
                        singleMode={singleMode}
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
}

function FilterKeySubmenu<TData extends RowData>({
  filterColumn,
  selectedValues,
  actions,
  table,
}: {
  filterColumn: FilterColumnConfig;
  selectedValues: string[];
  actions: DataTableFilterActions;
  table?: Table<TData> | undefined;
}) {
  switch (filterColumn.type) {
    case 'text':
      return (
        <TextValueController
          actions={actions}
          columnId={filterColumn.id}
          initialValue={selectedValues[0] ?? ''}
          label={filterColumn.displayName}
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

interface ActiveFilterProps<TData extends RowData> {
  actions: DataTableFilterActions;
  column: FilterColumnConfig;
  filter: FilterModel;
  table?: Table<TData> | undefined;
  tone?: BadgeTone | undefined;
  variant?: DataTableFilterVariant | undefined;
}

function ActiveFilter<TData extends RowData>({
  filter,
  column: col,
  actions,
  table,
  tone = 'primary',
  variant = 'subtle',
}: ActiveFilterProps<TData>) {
  return (
    <div className={cn(badgeVariants({ tone, variant }), 'flex h-7 items-center rounded-2xl text-body-sm shadow-xs')}>
      <FilterSubject filterColumn={col} />
      <Separator orientation="vertical" />
      <FilterOperator actions={actions} columnName={col.displayName} filter={filter} />
      <Separator orientation="vertical" />
      <FilterValue actions={actions} filter={filter} filterColumn={col} table={table} />
      <Separator orientation="vertical" />
      <FacetedControl
        aria-label={`Remove ${col.displayName} filter`}
        kind="remove"
        onClick={() => {
          actions.removeFilter(filter.columnId);
        }}
      >
        <X className="size-3.5" />
      </FacetedControl>
    </div>
  );
}
ActiveFilter.displayName = 'ActiveFilter';

function FilterSubject({ filterColumn }: { filterColumn: FilterColumnConfig }) {
  return (
    <span className="flex items-center gap-1 px-2 font-medium whitespace-nowrap opacity-75 select-none">
      {filterColumn.icon === undefined ? null : <filterColumn.icon className="size-4" />}
      <span>{filterColumn.displayName}</span>
    </span>
  );
}
FilterSubject.displayName = 'FilterSubject';

interface FilterOperatorProps {
  actions: DataTableFilterActions;
  columnName: string;
  filter: FilterModel;
}

function FilterOperator({ filter, actions, columnName }: FilterOperatorProps) {
  const [open, setOpen] = useState(false);
  const commandRef = useRef<HTMLDivElement>(null);

  const operators = getOperatorsForType(filter.type);
  const currentOp = operators[filter.operator];
  const currentTarget = currentOp?.target ?? 'single';
  const relatedOperators = Object.values(operators).filter((o) => o.target === currentTarget);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <FacetedControl aria-description={filter.operator} aria-label={`Edit ${columnName} operator`} kind="segment">
            <span className="opacity-80">{filter.operator}</span>
          </FacetedControl>
        }
      />
      <PopoverContent align="start" className="w-fit" initialFocus={commandRef} padding="none">
        <Command defaultValue={filter.operator} loop>
          <CommandList className="max-h-fit" label={`${columnName} operators`} ref={commandRef}>
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

interface FilterValueProps<TData extends RowData> {
  actions: DataTableFilterActions;
  filter: FilterModel;
  filterColumn: FilterColumnConfig;
  table?: Table<TData> | undefined;
}

function FilterValue<TData extends RowData>({ filter, filterColumn, actions, table }: FilterValueProps<TData>) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <FacetedControl
            aria-description={describeFilterValues(filter, filterColumn)}
            aria-label={`Edit ${filterColumn.displayName} values`}
            kind="segment"
          >
            <FilterValueDisplay filter={filter} filterColumn={filterColumn} />
          </FacetedControl>
        }
      />
      <PopoverContent align="start" className="w-fit" padding="none" side="bottom">
        <FilterValueController actions={actions} filter={filter} filterColumn={filterColumn} table={table} />
      </PopoverContent>
    </Popover>
  );
}

function describeFilterValues(filter: FilterModel, column: FilterColumnConfig): string {
  if (filter.values.length === 0) {
    return 'No values selected';
  }
  const options = column.type === 'text' ? [] : (column.options ?? []);
  return filter.values.map((value) => options.find((option) => option.value === value)?.label ?? value).join(', ');
}

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
  const selectedValues = new Set(filter.values);
  const selected = options.filter((o) => selectedValues.has(o.value));

  if (selected.length === 0 && filter.values.length > 0) {
    return <span>{filter.values.length === 1 ? filter.values[0] : `${filter.values.length} selected`}</span>;
  }

  const selectedOption = selected.at(0);
  if (selected.length === 1 && selectedOption !== undefined) {
    const { label, icon: ItemIcon } = selectedOption;
    return (
      <span className="inline-flex items-center gap-1">
        {ItemIcon === undefined ? null : renderIcon(ItemIcon, 'size-4')}
        <span>{label}</span>
      </span>
    );
  }

  const name = (filterColumn.displayNamePlural ?? `${filterColumn.displayName}s`).toLowerCase();
  const hasIcons = options.length > 0 && options.every((o) => o.icon !== undefined);

  return (
    <span className="inline-flex items-center gap-0.5">
      {hasIcons
        ? selected.slice(0, 3).map(({ value, icon }) => {
            if (icon === undefined) {
              return null;
            }
            const el = renderIcon(icon, 'size-4');
            return el === null ? <span key={value} /> : <span key={value}>{el}</span>;
          })
        : null}
      <span className={cn(hasIcons ? 'ml-1.5' : undefined)}>
        {selected.length} {name}
      </span>
    </span>
  );
}

function FilterValueController<TData extends RowData>({
  filter,
  filterColumn,
  actions,
  table,
}: {
  filter: FilterModel;
  filterColumn: FilterColumnConfig;
  actions: DataTableFilterActions;
  table?: Table<TData> | undefined;
}) {
  switch (filterColumn.type) {
    case 'text':
      return (
        <TextValueController
          actions={actions}
          columnId={filter.columnId}
          initialValue={filter.values[0] ?? ''}
          label={filterColumn.displayName}
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

function TextValueController({
  columnId,
  initialValue,
  actions,
  label,
  placeholder,
}: {
  columnId: string;
  initialValue: string;
  actions: DataTableFilterActions;
  label: string;
  placeholder?: string | undefined;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? initialValue;
  const applyValue = useEffectEvent((nextColumnId: string, nextValue: string) => {
    actions.setFilterValues(nextColumnId, nextValue.trim() === '' ? [] : [nextValue]);
  });

  useEffect(() => {
    if (draft === null) {
      return;
    }
    const timer = setTimeout(() => {
      applyValue(columnId, draft);
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [draft, columnId]);

  return (
    <div className="p-2">
      <Input
        aria-label={`Filter ${label}`}
        autoFocus
        className="h-8"
        onChange={(e) => {
          setDraft(e.target.value);
        }}
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

interface OptionItemProps {
  onToggle: (value: string, checked: boolean) => void;
  option: FilterOption & { selected: boolean; count?: number | undefined };
  singleMode?: boolean | undefined;
}

function OptionItem({ option, onToggle, singleMode }: OptionItemProps) {
  const { value, label, icon: ItemIcon, selected, count } = option;

  const handleSelect = () => {
    if (singleMode === true && selected) {
      return;
    }
    onToggle(value, !selected);
  };

  return (
    <CommandItem
      aria-description={selected ? 'Included in filter' : 'Not included in filter'}
      className="group"
      keywords={[label]}
      onSelect={handleSelect}
      value={value}
    >
      {singleMode === true ? (
        <RadioIndicator checked={selected} />
      ) : (
        <CheckboxView
          checked={selected}
          className="invisible mr-1 group-data-[selected=true]:visible data-[state=checked]:visible"
        />
      )}
      {ItemIcon === undefined ? null : renderIcon(ItemIcon, 'size-4 text-primary')}
      <span>
        {label}
        {count === undefined ? null : (
          <sup
            className={cn('ml-0.5 tracking-tight text-subtle tabular-nums', count === 0 ? 'slashed-zero' : undefined)}
          >
            {count < 100 ? count : '100+'}
          </sup>
        )}
      </span>
    </CommandItem>
  );
}

function OptionValueController<TData extends RowData>({
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
  table?: Table<TData> | undefined;
}) {
  const singleMode = filterColumn.type === 'option' && filterColumn.mode === 'single';
  const baseOptions = filterColumn.options;
  const facetedCounts = table?.getColumn(columnId)?.getFacetedUniqueValues();

  const selected = new Set(selectedValues);
  const enrichedOptions = (baseOptions ?? []).map((o) => ({
    ...o,
    selected: selected.has(o.value),
    count: facetedCounts?.get(o.value),
  }));

  const handleToggle = (val: string, checked: boolean) => {
    if (singleMode && checked) {
      actions.setFilterValues(columnId, [val]);
    } else if (checked) {
      actions.addFilterValue(columnId, val);
    } else {
      actions.removeFilterValue(columnId, val);
    }
  };

  return (
    <Command loop>
      <CommandInput autoFocus placeholder="Search..." />
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandList className="max-h-fit">
        <CommandGroup>
          {enrichedOptions.map((option) => (
            <OptionItem key={option.value} onToggle={handleToggle} option={option} singleMode={singleMode} />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function FilterActions({
  hasFilters,
  actions,
  tone = 'primary',
  variant = 'subtle',
}: {
  hasFilters: boolean;
  actions: DataTableFilterActions;
  tone?: BadgeTone | undefined;
  variant?: DataTableFilterVariant | undefined;
}) {
  return hasFilters ? (
    <FacetedControl kind="clear" onClick={actions.removeAllFilters} tone={tone} variant={variant}>
      <span>Clear</span>
    </FacetedControl>
  ) : null;
}
