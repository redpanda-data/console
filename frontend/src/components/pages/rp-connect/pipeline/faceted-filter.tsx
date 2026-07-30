/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { Column } from '@tanstack/react-table';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from 'components/redpanda-ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Separator } from 'components/redpanda-ui/components/separator';
import { cn, type SharedProps } from 'components/redpanda-ui/lib/utils';

interface FacetedFilterProps<TData, TValue> extends SharedProps {
  column?: Column<TData, TValue>;
  title?: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  labelClassName?: string;
}

/**
 * Verbatim copy of the registry's DataTableFacetedFilter with exactly ONE
 * delta: selected values shown in the trigger render their option icon (the
 * two lines marked DELTA below). Delete this file and switch back to the
 * registry component once that lands upstream.
 */
export function FacetedFilter<TData, TValue>({
  column,
  title,
  options,
  testId,
  labelClassName,
}: FacetedFilterProps<TData, TValue>) {
  const facets = column?.getFacetedUniqueValues();
  const selectedValues = new Set(column?.getFilterValue() as string[]);

  return (
    <Popover testId={testId}>
      <PopoverTrigger
        render={
          <Button className="h-8 border-dashed" size="sm" variant="outline">
            {title}
            {selectedValues?.size > 0 && (
              <>
                <Separator className="mx-2 h-4 self-center" orientation="vertical" />
                <Badge className="rounded-sm px-1 font-normal lg:hidden" variant="secondary">
                  {selectedValues.size}
                </Badge>
                <div className="hidden gap-1 lg:flex">
                  {selectedValues.size > 2 ? (
                    <Badge className="rounded-sm px-1 font-normal" variant="secondary">
                      {selectedValues.size} selected
                    </Badge>
                  ) : (
                    options
                      .filter((option) => selectedValues.has(option.value))
                      .map((option) => (
                        <Badge className="rounded-sm px-1 font-normal" key={option.value} variant="secondary">
                          {/* DELTA: show the option's icon alongside its label */}
                          {option.icon ? <option.icon className="size-3.5" /> : null}
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
      <PopoverContent align="start" className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem
                    className="gap-3"
                    key={option.value}
                    onSelect={() => {
                      const filterValues = isSelected
                        ? Array.from(selectedValues).filter((v) => v !== option.value)
                        : [...Array.from(selectedValues), option.value];
                      column?.setFilterValue(filterValues.length ? filterValues : undefined);
                    }}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        const filterValues = checked
                          ? [...Array.from(selectedValues), option.value]
                          : Array.from(selectedValues).filter((v) => v !== option.value);
                        column?.setFilterValue(filterValues.length ? filterValues : undefined);
                      }}
                    />
                    <div className="flex flex-1 items-center gap-2">
                      {option.icon ? <option.icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                      <span className={cn('flex-1', labelClassName)}>{option.label}</span>
                      {facets?.get(option.value) ? (
                        <span className="ml-auto flex size-4 items-center justify-center font-mono text-muted-foreground text-xs">
                          {facets.get(option.value)}
                        </span>
                      ) : null}
                    </div>
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
