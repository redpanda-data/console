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
import { useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';

import { DisclosureRow } from '../../disclosure-row';
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

  const [tailInterval, fullSyncInterval, maxSourceRequestRate, unsupportedSchemaFeatures] = useWatch({
    control,
    name: [
      'schemaRegistry.syncBehavior.tailInterval',
      'schemaRegistry.syncBehavior.fullSyncInterval',
      'schemaRegistry.syncBehavior.maxSourceRequestRate',
      'schemaRegistry.syncBehavior.unsupportedSchemaFeatures',
    ],
  });
  // Signal non-default values while collapsed (e.g. a hydrated link being
  // edited) so customization isn't mistaken for cluster defaults.
  const isCustomized =
    Boolean(tailInterval || fullSyncInterval || maxSourceRequestRate) || unsupportedSchemaFeatures === 'remove';

  return (
    <DisclosureRow
      badge={
        isCustomized ? (
          <Badge size="sm" testId="sr-sync-behavior-customized-badge" tone="success" variant="subtle">
            Customized
          </Badge>
        ) : null
      }
      description="Polling intervals, rate limits, and how to handle unsupported schema features. Cluster defaults apply if unset."
      label="Sync behavior"
      onOpenChange={setIsOpen}
      open={open}
      panel="plain"
      testId="sr-sync-behavior"
      triggerTestId="sr-sync-behavior-trigger"
    >
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
    </DisclosureRow>
  );
};
