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
} from 'components/redpanda-ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Server } from 'lucide-react';
import type { FC } from 'react';

export type ServiceInfo = {
  /** Display name shown in the UI (e.g., "unknown" for empty service names) */
  name: string;
  /** Actual service name value to send to the API (can be empty string) */
  value: string;
  count: number;
};

export type ServiceFilterProps = {
  services: ServiceInfo[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

export const ServiceFilter: FC<ServiceFilterProps> = ({ services, selected, onChange }) => {
  // selected contains actual values (which can be empty strings)
  const selectedSet = new Set(selected);
  const isDisabled = services.length === 0;

  const toggleService = (serviceValue: string) => {
    const newSelected = new Set(selectedSet);
    if (newSelected.has(serviceValue)) {
      newSelected.delete(serviceValue);
    } else {
      newSelected.add(serviceValue);
    }
    onChange(Array.from(newSelected));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="h-8 gap-1.5" disabled={isDisabled} size="sm" variant="outline">
          <Server className="h-3.5 w-3.5" />
          Service
          {selectedSet.size > 0 && (
            <>
              <Separator className="mx-1 h-4" orientation="vertical" />
              <Badge className="lg:hidden" size="sm" variant="primary-inverted">
                {selectedSet.size}
              </Badge>
              <div className="hidden gap-1 lg:flex">
                {selectedSet.size > 2 ? (
                  <Badge size="sm" variant="primary-inverted">
                    {selectedSet.size} selected
                  </Badge>
                ) : (
                  services
                    .filter((s) => selectedSet.has(s.value))
                    .map((s) => (
                      <Badge key={s.value} size="sm" variant="primary-inverted">
                        {s.name}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[220px] p-0">
        <Command>
          <CommandInput placeholder="Search services..." />
          <CommandList>
            <CommandEmpty>No services found.</CommandEmpty>
            <CommandGroup>
              {services.map((service) => {
                const isSelected = selectedSet.has(service.value);
                return (
                  <CommandItem className="gap-2" key={service.value} onSelect={() => toggleService(service.value)}>
                    <Checkbox checked={isSelected} className="pointer-events-none" />
                    <span className="flex-1 truncate">{service.name}</span>
                    <span className="text-muted-foreground text-xs">({service.count})</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selectedSet.size > 0 && (
            <>
              <Separator />
              <div className="p-1">
                <Button className="w-full justify-center" onClick={clearAll} size="sm" variant="ghost">
                  Clear filters
                </Button>
              </div>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
};
