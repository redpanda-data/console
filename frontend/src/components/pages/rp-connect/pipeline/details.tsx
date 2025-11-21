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

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Slider } from 'components/redpanda-ui/components/slider';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { ChevronDown } from 'lucide-react';
import { useFormContext } from 'react-hook-form';

import { MAX_TASKS, MIN_TASKS } from '../tasks';

interface DetailsProps {
  readonly?: boolean;
}

export function Details({ readonly = false }: DetailsProps) {
  const { control } = useFormContext();

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel required>Pipeline Name</FormLabel>
            <FormControl>
              <Input {...field} disabled={readonly} placeholder="Enter pipeline name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/50 px-4 py-2 font-medium text-sm hover:bg-muted">
          <span>Advanced Settings</span>
          <ChevronDown className="h-4 w-4 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          <FormField
            control={control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    disabled={readonly}
                    placeholder="Optional description for this pipeline"
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {!readonly && (
            <FormField
              control={control}
              name="computeUnits"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Compute Units: {field.value}</FormLabel>
                  <FormControl>
                    <Slider
                      disabled={readonly}
                      max={MAX_TASKS}
                      min={MIN_TASKS}
                      onValueChange={(values) => field.onChange(values[0])}
                      step={1}
                      value={[field.value]}
                    />
                  </FormControl>
                  <FormDescription>One compute unit = 0.1 CPU and 400 MB memory</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
