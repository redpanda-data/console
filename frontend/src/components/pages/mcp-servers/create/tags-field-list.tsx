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
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';

import type { FormValues } from './schemas';

interface TagsFieldListProps {
  form: UseFormReturn<FormValues>;
  tagFields: UseFieldArrayReturn<FormValues, 'tags', 'id'>['fields'];
  appendTag: UseFieldArrayReturn<FormValues, 'tags', 'id'>['append'];
  removeTag: UseFieldArrayReturn<FormValues, 'tags', 'id'>['remove'];
}

export const TagsFieldList: React.FC<TagsFieldListProps> = ({ form, tagFields, appendTag, removeTag }) => {
  return (
    <div className="flex flex-col gap-2">
      <Text variant="label">Tags</Text>
      <Text variant="muted">Key-value pairs for organizing and categorizing</Text>
      {tagFields.map((f, idx) => (
        <div className="flex items-center gap-2" key={f.id}>
          <FormField
            control={form.control}
            name={`tags.${idx}.key` as const}
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
            name={`tags.${idx}.value` as const}
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
        name="tags"
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
