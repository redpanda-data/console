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
import { cn } from 'components/redpanda-ui/lib/utils';
import { CheckIcon, ChevronsUpDownIcon, InfoIcon } from 'lucide-react';
import type { FC } from 'react';
import { useState } from 'react';

import { type DerivedContext, pluralize } from './schema-context-utils';
import { TonedIcon } from '../shared/toned-icon';

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
    <div className="flex items-center gap-1.5">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button className="h-7" data-testid="schema-context-selector" size="sm" variant="outline">
              <span className="max-w-40 truncate">{selectedLabel}</span>
              <TonedIcon className="size-3.5 shrink-0" icon={ChevronsUpDownIcon} tone="muted" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-[280px]">
          <Command size="full" variant="minimal">
            <CommandInput placeholder="Search contexts..." />
            <CommandList>
              <CommandEmpty>No contexts found.</CommandEmpty>
              {contexts.map((ctx) => (
                <CommandItem
                  className="flex items-start"
                  key={ctx.id}
                  onSelect={() => {
                    onContextChange(ctx.id);
                    setOpen(false);
                  }}
                  value={ctx.label}
                >
                  <span
                    className={cn('mt-0.5 flex shrink-0', selectedContext === ctx.id ? 'opacity-100' : 'opacity-0')}
                  >
                    <CheckIcon className="size-4" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-body">{ctx.label}</span>
                    <span className="text-body-sm text-muted-foreground">{pluralize(ctx.subjectCount, 'subject')}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex cursor-help">
              <TonedIcon className="size-4" icon={InfoIcon} tone="muted" />
            </span>
          }
        />
        <TooltipContent className="max-w-64" side="top">
          Schema Registry contexts group subjects into isolated namespaces. The selected context determines the mode and
          compatibility shown here, which schemas are listed, and where new schemas are created.
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
