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

import { Button } from 'components/redpanda-ui/components/button';
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
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Plus, X } from 'lucide-react';
import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import type { FormValues } from './schemas';

interface TopicsStepProps {
  form: UseFormReturn<FormValues>;
  topicPropertiesFields: any[];
  appendTopicProperty: (value: any) => void;
  removeTopicProperty: (index: number) => void;
}

export const TopicsStep = ({
  form,
  topicPropertiesFields,
  appendTopicProperty,
  removeTopicProperty,
}: TopicsStepProps) => {
  const includeAllTopics = form.watch('includeAllTopics');
  const listSpecificTopics = form.watch('listSpecificTopics');
  const includeTopicPrefix = form.watch('includeTopicPrefix');
  const excludeTopicPrefix = form.watch('excludeTopicPrefix');

  // Get root-level topic selection validation error (custom error path from Zod refine)
  const topicSelectionError = (form.formState.errors as any).topicSelection?.message;

  // Re-validate whenever topic checkbox selections change
  useEffect(() => {
    form.trigger();
  }, [form]);

  return (
    <Card size="full">
      <CardHeader>
        <CardTitle>Topics to Mirror</CardTitle>
        <CardDescription>Select which topics to replicate from the source cluster</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Show validation error at the top */}
          {topicSelectionError && <div className="font-medium text-destructive text-sm">{topicSelectionError}</div>}
          {/* Include all topics - mutually exclusive */}
          <FormField
            control={form.control}
            name="includeAllTopics"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start space-x-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        // If checking "all topics", uncheck all others
                        if (checked) {
                          form.setValue('listSpecificTopics', false);
                          form.setValue('includeTopicPrefix', false);
                          form.setValue('excludeTopicPrefix', false);
                        }
                      }}
                    />
                  </FormControl>
                  <div className="flex-1 space-y-1">
                    <FormLabel>Include all topics</FormLabel>
                    <FormDescription>Mirror all topics from the source cluster</FormDescription>
                  </div>
                </div>
              </FormItem>
            )}
          />

          {/* List specific topics */}
          <FormField
            control={form.control}
            name="listSpecificTopics"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start space-x-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      disabled={includeAllTopics}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (checked) {
                          form.setValue('includeAllTopics', false);
                        }
                      }}
                    />
                  </FormControl>
                  <div className="flex-1 space-y-1">
                    <FormLabel>List specific topics</FormLabel>
                    <FormDescription>Specify exact topic names to mirror</FormDescription>
                  </div>
                </div>

                {listSpecificTopics && (
                  <div className="mt-3 ml-9">
                    <FormField
                      control={form.control}
                      name="specificTopicNames"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              placeholder="Enter topic names (comma-separated)&#10;e.g., orders, payments, users"
                              rows={4}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>Enter topic names separated by commas</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </FormItem>
            )}
          />

          {/* Include topic names starting with */}
          <FormField
            control={form.control}
            name="includeTopicPrefix"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start space-x-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      disabled={includeAllTopics}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (checked) {
                          form.setValue('includeAllTopics', false);
                        }
                      }}
                    />
                  </FormControl>
                  <div className="flex-1 space-y-1">
                    <FormLabel>Include topic names starting with</FormLabel>
                    <FormDescription>Mirror topics matching a prefix pattern</FormDescription>
                  </div>
                </div>

                {includeTopicPrefix && (
                  <div className="mt-3 ml-9">
                    <FormField
                      control={form.control}
                      name="includePrefix"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="e.g., prod-, staging-" {...field} />
                          </FormControl>
                          <FormDescription>Topics starting with this prefix will be included</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </FormItem>
            )}
          />

          {/* Exclude topic names starting with */}
          <FormField
            control={form.control}
            name="excludeTopicPrefix"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start space-x-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      disabled={includeAllTopics}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (checked) {
                          form.setValue('includeAllTopics', false);
                        }
                      }}
                    />
                  </FormControl>
                  <div className="flex-1 space-y-1">
                    <FormLabel>Exclude topic names starting with</FormLabel>
                    <FormDescription>Exclude topics matching a prefix pattern</FormDescription>
                  </div>
                </div>

                {excludeTopicPrefix && (
                  <div className="mt-3 ml-9">
                    <FormField
                      control={form.control}
                      name="excludePrefix"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="e.g., internal-, test-" {...field} />
                          </FormControl>
                          <FormDescription>Topics starting with this prefix will be excluded</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </FormItem>
            )}
          />

          {/* Topic Properties Section */}
          <div className="border-t pt-6">
            <div className="space-y-3">
              <div>
                <FormLabel>Additional Topic Properties (Optional)</FormLabel>
                <FormDescription>
                  Configure additional Kafka topic properties to replicate. The following are always replicated:
                  partition count, max.message.bytes, cleanup.policy, timestamp.type
                </FormDescription>
              </div>

              {/* Dynamic list of properties */}
              {topicPropertiesFields.map((field, index) => (
                <div className="flex items-center gap-2" key={field.id}>
                  <FormField
                    control={form.control}
                    name={`topicProperties.${index}`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input placeholder="e.g., retention.ms, compression.type, segment.ms" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button onClick={() => removeTopicProperty(index)} size="icon" type="button" variant="outline">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Button onClick={() => appendTopicProperty('')} size="sm" type="button" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Property
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
