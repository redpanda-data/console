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
import { Field, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import {
  Controller,
  type FieldArrayWithId,
  type UseFieldArrayAppend,
  type UseFieldArrayRemove,
  type UseFormReturn,
} from 'react-hook-form';

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
        <Controller
          control={form.control}
          name="displayName"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>Display Name</FieldLabel>
              <Input placeholder="Enter display name" {...field} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Description</FieldLabel>
              <Textarea placeholder="Enter description" rows={3} {...field} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <TagsFieldList appendTag={appendTag} fieldName="tags" form={form} removeTag={removeTag} tagFields={tagFields} />
      </div>
    </CardContent>
  </Card>
);
