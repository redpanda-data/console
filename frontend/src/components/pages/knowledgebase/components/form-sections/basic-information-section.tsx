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

import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import type { FieldArrayWithId, UseFieldArrayAppend, UseFieldArrayRemove, UseFormReturn } from 'react-hook-form';

import type { KnowledgeBaseCreateFormValues } from '../../schemas';

type BasicInformationSectionProps = {
  form: UseFormReturn<KnowledgeBaseCreateFormValues>;
  tagFields: FieldArrayWithId<KnowledgeBaseCreateFormValues, 'tags', 'id'>[];
  appendTag: UseFieldArrayAppend<KnowledgeBaseCreateFormValues, 'tags'>;
  removeTag: UseFieldArrayRemove;
};

export const BasicInformationSection: React.FC<BasicInformationSectionProps> = ({
  form,
  tagFields,
  appendTag,
  removeTag,
}) => (
  <Card size="full">
    <CardHeader>
      <CardTitle>Basic Information</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Display Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter display name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Enter description" rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <TagsFieldList appendTag={appendTag} fieldName="tags" form={form} removeTag={removeTag} tagFields={tagFields} />
      </div>
    </CardContent>
  </Card>
);
