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

import { Button } from 'components/redpanda-ui/components/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from 'components/redpanda-ui/components/command';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CheckIcon, ChevronDownIcon, InfoIcon } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';

import { type DerivedContext, pluralize } from './schema-context-utils';

type SchemaContextSelectorProps = {
  contexts: DerivedContext[];
  selectedContext: string;
  onContextChange: (id: string) => void;
};

// Custom combobox instead of registry Combobox: we need a button trigger,
// two-line items (label + subject count), and a search bar inside the popover.
export const SchemaContextSelector: FC<SchemaContextSelectorProps> = ({
  contexts,
  selectedContext,
  onContextChange,
}) => {
  const [open, setOpen] = useState(false);

  const selectedLabel = contexts.find((c) => c.id === selectedContext)?.label ?? 'All';

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Text as="span" variant="bodyStrongSmall">
          Context
        </Text>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-help">
              <InfoIcon className="size-4 text-muted-foreground" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            Schema registry contexts allow grouping subjects into isolated namespaces
          </TooltipContent>
        </Tooltip>
      </div>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button
            className="w-44 justify-between truncate"
            data-testid="schema-context-selector"
            variant="secondary-outline"
          >
            <Text as="span" className="truncate">
              {selectedLabel}
            </Text>
            <ChevronDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[280px] p-0">
          <Command size="full" variant="minimal">
            <CommandInput placeholder="Search contexts..." />
            <CommandList>
              <CommandEmpty>No contexts found.</CommandEmpty>
              {contexts.map((ctx) => (
                <CommandItem
                  className="flex items-start gap-2 py-2"
                  key={ctx.id}
                  onSelect={() => {
                    onContextChange(ctx.id);
                    setOpen(false);
                  }}
                  value={ctx.label}
                >
                  <CheckIcon
                    className={cn('mt-0.5 size-4 shrink-0', selectedContext === ctx.id ? 'opacity-100' : 'opacity-0')}
                  />
                  <div className="flex flex-col">
                    <Text as="span" variant="body">
                      {ctx.label}
                    </Text>
                    <Text as="span" className="text-muted-foreground" variant="captionMedium">
                      {pluralize(ctx.subjectCount, 'subject')}
                    </Text>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
