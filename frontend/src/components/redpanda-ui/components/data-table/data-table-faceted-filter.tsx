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
  column?: Column<DataTableFeatures, TData, TValue> | undefined;
  labelClassName?: string | undefined;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string | undefined }> | undefined;
  }[];
  title?: string | undefined;
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
                  <Badge className="lg:hidden" size="sm" tone="default" variant="subtle">
                    {selectedValues.size}
                  </Badge>
                  <div className="hidden gap-1 lg:flex">
                    {selectedValues.size > 2 ? (
                      <Badge size="sm" tone="default" variant="subtle">
                        {selectedValues.size} selected
                      </Badge>
                    ) : (
                      options.flatMap((option) =>
                        selectedValues.has(option.value)
                          ? [
                              <Badge key={option.value} size="sm" tone="default" variant="subtle">
                                {option.icon === undefined ? null : <option.icon />}
                                {option.label}
                              </Badge>,
                            ]
                          : []
                      )
                    )}
                  </div>
                </>
              )}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto max-w-[300px] min-w-[200px]" padding="none">
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
                        column?.setFilterValue(filterValues.length > 0 ? filterValues : undefined);
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
                      {option.icon === undefined ? null : <option.icon className="size-4 shrink-0 text-subtle" />}
                      <span className={cn(labelClassName)}>{option.label}</span>
                      {/* cmdk reserves aria-selected for highlight, so this is the only SR signal. */}
                      {isSelected ? <span className="sr-only">, selected</span> : null}
                      {(facets?.get(option.value) ?? 0) === 0 ? null : (
                        <span className="ml-auto flex size-4 items-center justify-center font-mono text-body-sm text-subtle">
                          {facets?.get(option.value)}
                        </span>
                      )}
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

  if (column === undefined) {
    return renderFilter();
  }

  return <Subscribe source={column.table.atoms.columnFilters}>{renderFilter}</Subscribe>;
}
