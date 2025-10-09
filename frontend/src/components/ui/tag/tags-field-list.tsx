/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { FormControl, FormField, FormItem, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { Plus, Trash2 } from 'lucide-react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

type TagsFieldListProps<TFieldValues extends FieldValues> = {
  form: UseFormReturn<TFieldValues>;
  // biome-ignore lint/suspicious/noExplicitAny: Generic component needs flexibility for different tag field structures
  tagFields: Array<{ id: string; [key: string]: any }>;
  // biome-ignore lint/suspicious/noExplicitAny: Accepts different tag types from different forms (value can be optional or required)
  appendTag: (value: any) => void;
  removeTag: (index: number) => void;
  fieldName: string;
};

/**
 * Reusable tags field list component for managing key-value tags
 * Can be used in AI Agents, MCP Servers, and any other resource that needs tags
 *
 * @example
 * // In your form component:
 * const { fields, append, remove } = useFieldArray({
 *   control: form.control,
 *   name: 'tags',
 * });
 *
 * <TagsFieldList
 *   form={form}
 *   tagFields={fields}
 *   appendTag={append}
 *   removeTag={remove}
 *   fieldName="tags"
 * />
 */
export const TagsFieldList = <TFieldValues extends FieldValues>({
  form,
  tagFields,
  appendTag,
  removeTag,
  fieldName,
}: TagsFieldListProps<TFieldValues>) => {
  return (
    <div className="flex flex-col gap-2">
      <Text variant="label">Tags</Text>
      <Text variant="muted">Key-value pairs for organizing and categorizing</Text>
      {tagFields.map((f, idx) => (
        <div className="flex items-center gap-2" key={f.id}>
          <FormField
            control={form.control}
            name={`${fieldName}.${idx}.key` as Path<TFieldValues>}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input placeholder="Key" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={`${fieldName}.${idx}.value` as Path<TFieldValues>}
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input placeholder="Value" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button onClick={() => removeTag(idx)} size="icon" type="button" variant="outline">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button onClick={() => appendTag({ key: '', value: '' })} type="button" variant="dashed">
        <Plus className="h-4 w-4" /> Add Tag
      </Button>
      {/* Array-level message for duplicate keys */}
      <FormField
        control={form.control}
        name={fieldName as Path<TFieldValues>}
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
