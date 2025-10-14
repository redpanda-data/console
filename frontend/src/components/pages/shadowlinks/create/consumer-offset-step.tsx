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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { FormValues } from './schemas';

interface ConsumerOffsetStepProps {
  form: UseFormReturn<FormValues>;
}

export const ConsumerOffsetStep = ({ form }: ConsumerOffsetStepProps) => {
  const enableConsumerOffsetSync = form.watch('enableConsumerOffsetSync');
  const includeAllGroups = form.watch('includeAllGroups');
  const listSpecificGroups = form.watch('listSpecificGroups');
  const includeGroupPrefix = form.watch('includeGroupPrefix');
  const excludeGroupPrefix = form.watch('excludeGroupPrefix');

  // Get root-level group selection validation error (custom error path from Zod refine)
  const groupSelectionError = (form.formState.errors as any).groupSelection?.message;

  // Re-validate whenever group checkbox selections change
  useEffect(() => {
    if (enableConsumerOffsetSync) {
      form.trigger();
    }
  }, [enableConsumerOffsetSync, form]);

  return (
    <Card size="full">
      <CardHeader>
        <CardTitle>Consumer Groups</CardTitle>
        <CardDescription>Configure consumer group synchronization from the source cluster</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Enable toggle */}
          <FormField
            control={form.control}
            name="enableConsumerOffsetSync"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <div>
                  <FormLabel>Enable Consumer Group Sync</FormLabel>
                  <FormDescription>Synchronize consumer group offsets from the source cluster</FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          {enableConsumerOffsetSync && (
            <>
              {/* Sync Interval */}
              <div className="border-t pt-4">
                <FormField
                  control={form.control}
                  name="consumerOffsetSyncInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sync Interval (seconds)</FormLabel>
                      <FormControl>
                        <Input
                          min={1}
                          placeholder="30"
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormDescription>How often to sync consumer offsets (default: 30 seconds)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Consumer Group Filters */}
              <div className="border-t pt-6">
                <div className="space-y-6">
                  <div>
                    <FormLabel>Consumer Group Filters</FormLabel>
                    <FormDescription>Select which consumer groups to sync offsets for</FormDescription>
                  </div>

                  {/* Show validation error at the top */}
                  {groupSelectionError && (
                    <div className="font-medium text-destructive text-sm">{groupSelectionError}</div>
                  )}

                  {/* Include all groups - mutually exclusive */}
                  <FormField
                    control={form.control}
                    name="includeAllGroups"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start space-x-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                // If checking "all groups", uncheck all others
                                if (checked) {
                                  form.setValue('listSpecificGroups', false);
                                  form.setValue('includeGroupPrefix', false);
                                  form.setValue('excludeGroupPrefix', false);
                                }
                              }}
                            />
                          </FormControl>
                          <div className="flex-1 space-y-1">
                            <FormLabel>Include all consumer groups</FormLabel>
                            <FormDescription>Sync offsets for all consumer groups</FormDescription>
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* List specific groups */}
                  <FormField
                    control={form.control}
                    name="listSpecificGroups"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start space-x-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              disabled={includeAllGroups}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (checked) {
                                  form.setValue('includeAllGroups', false);
                                }
                              }}
                            />
                          </FormControl>
                          <div className="flex-1 space-y-1">
                            <FormLabel>List specific consumer groups</FormLabel>
                            <FormDescription>Specify exact consumer group names</FormDescription>
                          </div>
                        </div>

                        {listSpecificGroups && (
                          <div className="mt-3 ml-9">
                            <FormField
                              control={form.control}
                              name="specificGroupNames"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Textarea
                                      placeholder="Enter consumer group names (comma-separated)&#10;e.g., my-consumer-group, analytics-group"
                                      rows={4}
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormDescription>Enter consumer group names separated by commas</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}
                      </FormItem>
                    )}
                  />

                  {/* Include group names starting with */}
                  <FormField
                    control={form.control}
                    name="includeGroupPrefix"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start space-x-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              disabled={includeAllGroups}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (checked) {
                                  form.setValue('includeAllGroups', false);
                                }
                              }}
                            />
                          </FormControl>
                          <div className="flex-1 space-y-1">
                            <FormLabel>Include group names starting with</FormLabel>
                            <FormDescription>Sync offsets for groups matching a prefix pattern</FormDescription>
                          </div>
                        </div>

                        {includeGroupPrefix && (
                          <div className="mt-3 ml-9">
                            <FormField
                              control={form.control}
                              name="includeGroupPrefixValue"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input placeholder="e.g., prod-, app-" {...field} />
                                  </FormControl>
                                  <FormDescription>Groups starting with this prefix will be included</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}
                      </FormItem>
                    )}
                  />

                  {/* Exclude group names starting with */}
                  <FormField
                    control={form.control}
                    name="excludeGroupPrefix"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-start space-x-3">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              disabled={includeAllGroups}
                              onCheckedChange={(checked) => {
                                field.onChange(checked);
                                if (checked) {
                                  form.setValue('includeAllGroups', false);
                                }
                              }}
                            />
                          </FormControl>
                          <div className="flex-1 space-y-1">
                            <FormLabel>Exclude group names starting with</FormLabel>
                            <FormDescription>Exclude groups matching a prefix pattern</FormDescription>
                          </div>
                        </div>

                        {excludeGroupPrefix && (
                          <div className="mt-3 ml-9">
                            <FormField
                              control={form.control}
                              name="excludeGroupPrefixValue"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input placeholder="e.g., test-, internal-" {...field} />
                                  </FormControl>
                                  <FormDescription>Groups starting with this prefix will be excluded</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
