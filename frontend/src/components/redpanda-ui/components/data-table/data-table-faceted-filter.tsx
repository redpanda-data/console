'use client';

import { type Column, type RowData, Subscribe } from '@tanstack/react-table';
import { Check } from 'lucide-react';
import type React from 'react';

import { Badge } from '../badge';
import { Button } from '../button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../command';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Separator } from '../separator';
import { cn, type SharedProps } from '../../lib/utils';

import type { DataTableFeatures } from './data-table-features';

interface DataTableFacetedFilterProps<TData extends RowData, TValue> extends SharedProps {
  column?: Column<DataTableFeatures, TData, TValue>;
  title?: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  labelClassName?: string;
}

export function DataTableFacetedFilter<TData extends RowData, TValue>({
  column,
  title,
  options,
  testId,
  labelClassName,
}: DataTableFacetedFilterProps<TData, TValue>) {
  function renderFilter() {
    const facets = column?.getFacetedUniqueValues();
    const filterValue = column?.getFilterValue();
    const selectedValues = new Set(
      Array.isArray(filterValue) ? filterValue.filter((value): value is string => typeof value === 'string') : []
    );

    return (
      <Popover testId={testId}>
        <PopoverTrigger
          render={
            <Button className="h-8" size="sm" variant="dashed">
              {title}
              {selectedValues.size > 0 && (
                <>
                  <Separator className="mx-2 h-4 self-center" orientation="vertical" />
                  <Badge className="font-normal lg:hidden" size="sm" tone="default" variant="subtle">
                    {selectedValues.size}
                  </Badge>
                  <div className="hidden gap-1 lg:flex">
                    {selectedValues.size > 2 ? (
                      <Badge className="font-normal" size="sm" tone="default" variant="subtle">
                        {selectedValues.size} selected
                      </Badge>
                    ) : (
                      options
                        .filter((option) => selectedValues.has(option.value))
                        .map((option) => (
                          <Badge className="font-normal" key={option.value} size="sm" tone="default" variant="subtle">
                            {option.icon ? <option.icon /> : null}
                            {option.label}
                          </Badge>
                        ))
                    )}
                  </div>
                </>
              )}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto min-w-[200px] max-w-[300px] p-0">
          <Command>
            <CommandInput placeholder={title} />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selectedValues.has(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      onSelect={() => {
                        const filterValues = isSelected
                          ? Array.from(selectedValues).filter((v) => v !== option.value)
                          : [...Array.from(selectedValues), option.value];
                        column?.setFilterValue(filterValues.length ? filterValues : undefined);
                      }}
                      // Explicit value keeps cmdk typeahead off the sr-only marker and facet count.
                      value={option.label}
                    >
                      <div
                        className={cn(
                          'flex size-4 items-center justify-center rounded-[4px] border',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input [&_svg]:invisible'
                        )}
                      >
                        <Check className="size-3.5 text-primary-foreground" />
                      </div>
                      {option.icon ? <option.icon className="size-4 shrink-0 text-subtle" /> : null}
                      <span className={cn(labelClassName)}>{option.label}</span>
                      {/* cmdk reserves aria-selected for highlight, so this is the only SR signal. */}
                      {isSelected ? <span className="sr-only">, selected</span> : null}
                      {facets?.get(option.value) ? (
                        <span className="ml-auto flex size-4 items-center justify-center font-mono text-body-sm text-subtle">
                          {facets.get(option.value)}
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {selectedValues.size > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      className="justify-center text-center"
                      onSelect={() => column?.setFilterValue(undefined)}
                    >
                      Clear filters
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  if (!column) {
    return renderFilter();
  }

  return <Subscribe source={column.table.atoms.columnFilters}>{renderFilter}</Subscribe>;
}
