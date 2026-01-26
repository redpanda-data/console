'use client';

import { FilterIcon } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';

import { Badge } from './badge';
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
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Separator } from './separator';
import { cn, type SharedProps } from '../lib/utils';

export type FacetedFilterOption<T extends string = string> = {
  label: string;
  value: T;
  icon?: React.ComponentType<{ className?: string }>;
};

export type FacetedFilterProps<T extends string = string> = SharedProps & {
  /** Filter title displayed on the button */
  title: string;
  /** Available filter options */
  options: FacetedFilterOption<T>[];
  /** Currently selected values */
  selectedValues: T[];
  /** Callback when a value is toggled */
  onToggle: (value: T) => void;
  /** Callback to clear all selections */
  onClear?: () => void;
  /** Whether to show a search input */
  searchable?: boolean;
  /** Placeholder for search input */
  searchPlaceholder?: string;
  /** Custom icon for the filter button */
  icon?: React.ReactNode;
  /** Show facet counts (optional map of value to count) */
  facetCounts?: Map<T, number>;
  /** Additional class name for the trigger button */
  className?: string;
};

/**
 * A standalone faceted filter component for multi-select filtering.
 * Can be used independently or with TanStack Table via DataTableFacetedFilter.
 *
 * @example
 * ```tsx
 * const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>([]);
 *
 * <FacetedFilter
 *   title="Level"
 *   options={[
 *     { value: 'ERROR', label: 'Error' },
 *     { value: 'WARN', label: 'Warning' },
 *     { value: 'INFO', label: 'Info' },
 *   ]}
 *   selectedValues={selectedLevels}
 *   onToggle={(level) => {
 *     setSelectedLevels(prev =>
 *       prev.includes(level)
 *         ? prev.filter(l => l !== level)
 *         : [...prev, level]
 *     );
 *   }}
 *   onClear={() => setSelectedLevels([])}
 * />
 * ```
 */
export function FacetedFilter<T extends string = string>({
  title,
  options,
  selectedValues,
  onToggle,
  onClear,
  searchable = false,
  searchPlaceholder,
  icon = <FilterIcon />,
  facetCounts,
  className,
  testId,
}: FacetedFilterProps<T>) {
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const handleClear = useCallback(() => {
    if (onClear) {
      onClear();
    } else {
      // If no onClear provided, toggle off each selected value
      for (const value of selectedValues) {
        onToggle(value);
      }
    }
  }, [onClear, onToggle, selectedValues]);

  return (
    <Popover testId={testId}>
      <PopoverTrigger asChild>
        <Button className={cn('h-8 border-dashed', className)} icon={icon} size="sm" variant="secondary-outline">
          {title}
          {selectedSet.size > 0 ? (
            <>
              <Separator className="mx-2 h-4" orientation="vertical" />
              <Badge className="lg:hidden" variant="primary-inverted">
                {selectedSet.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selectedSet.size > 2 ? (
                  <Badge variant="primary-inverted">{selectedSet.size} selected</Badge>
                ) : (
                  options
                    .filter((option) => selectedSet.has(option.value))
                    .map((option) => (
                      <Badge key={option.value} variant="primary-inverted">
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px] p-0">
        <Command>
          {searchable ? <CommandInput placeholder={searchPlaceholder ?? title} /> : null}
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedSet.has(option.value);
                return (
                  <CommandItem className="gap-3" key={option.value} onSelect={() => onToggle(option.value)}>
                    <Checkbox
                      checked={isSelected}
                      className="size-4 shrink-0"
                      onCheckedChange={() => onToggle(option.value)}
                    />
                    <div className="flex flex-1 items-center gap-2">
                      {option.icon ? <option.icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                      <span className="flex-1">{option.label}</span>
                      {facetCounts?.get(option.value) !== undefined ? (
                        <span className="ml-auto flex size-4 shrink-0 items-center justify-center font-mono text-muted-foreground text-xs">
                          {facetCounts.get(option.value)}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedSet.size > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem className="justify-center text-center" onSelect={handleClear}>
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

FacetedFilter.displayName = 'FacetedFilter';
