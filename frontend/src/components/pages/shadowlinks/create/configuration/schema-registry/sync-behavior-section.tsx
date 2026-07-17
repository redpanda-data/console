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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';

import type { FormValues } from '../../model';

const UNSUPPORTED_FEATURE_OPTIONS = [
  { value: 'fail', label: 'Fail the sync' },
  { value: 'remove', label: 'Remove unsupported features' },
];

export const SyncBehaviorSection = () => {
  const { control } = useFormContext<FormValues>();
  const [isOpen, setIsOpen] = useState(false);
  const { errors } = useFormState({
    control,
    name: [
      'schemaRegistry.syncBehavior.tailInterval',
      'schemaRegistry.syncBehavior.fullSyncInterval',
      'schemaRegistry.syncBehavior.maxSourceRequestRate',
    ],
  });

  // Force open while a field has an error: the messages render inside, and a
  // collapsed panel would block submit with no visible feedback.
  const open = isOpen || Boolean(errors.schemaRegistry?.syncBehavior);

  return (
    <Collapsible onOpenChange={setIsOpen} open={open} testId="sr-sync-behavior">
      <CollapsibleTrigger
        render={
          <button
            className="-mx-2 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50"
            data-testid="sr-sync-behavior-trigger"
            type="button"
          >
            <ChevronRight
              className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
            />
            <div className="flex-1">
              <span className="font-medium text-sm">Sync behavior</span>
              <div className="mt-0.5 text-body-sm text-muted-foreground">
                Polling intervals, rate limits, and how to handle unsupported schema features. Cluster defaults apply if
                unset.
              </div>
            </div>
          </button>
        }
      />
      <CollapsibleContent className="mt-2 ml-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FormField
            control={control}
            name="schemaRegistry.syncBehavior.tailInterval"
            render={({ field }) => (
              <FormItem data-testid="sr-tail-interval-field">
                <FormLabel>Tail interval</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="10s" testId="sr-tail-interval-input" />
                </FormControl>
                <FormDescription>Interval between incremental polls for new subjects and versions.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="schemaRegistry.syncBehavior.fullSyncInterval"
            render={({ field }) => (
              <FormItem data-testid="sr-full-sync-interval-field">
                <FormLabel>Full sync interval</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="5m" testId="sr-full-sync-interval-input" />
                </FormControl>
                <FormDescription>Interval between full scans of the selected source subjects.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="schemaRegistry.syncBehavior.maxSourceRequestRate"
            render={({ field }) => (
              <FormItem data-testid="sr-max-request-rate-field">
                <FormLabel>Max source request rate</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="30" testId="sr-max-request-rate-input" />
                </FormControl>
                <FormDescription>Requests per second to the source Schema Registry.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={control}
          name="schemaRegistry.syncBehavior.unsupportedSchemaFeatures"
          render={({ field }) => (
            <FormItem className="md:max-w-xs" data-testid="sr-unsupported-features-field">
              <FormLabel>Unsupported schema features</FormLabel>
              <Select items={UNSUPPORTED_FEATURE_OPTIONS} onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="sr-unsupported-features-select">
                    <SelectValue placeholder="Select policy" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {UNSUPPORTED_FEATURE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Policy for source schema features the destination doesn't support, such as rulesets or metadata tags.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </CollapsibleContent>
    </Collapsible>
  );
};
