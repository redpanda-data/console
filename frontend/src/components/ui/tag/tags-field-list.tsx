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
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Plus, Trash2 } from 'lucide-react';
import { Controller, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';

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
      <FieldLabel>Tags</FieldLabel>
      <FieldDescription>Key-value pairs for organizing and categorizing</FieldDescription>
      {tagFields.map((f, idx) => (
        <div className="flex items-center gap-2" key={f.id}>
          <Controller
            control={form.control}
            name={`${fieldName}.${idx}.key` as Path<TFieldValues>}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="flex-1">
                <Input placeholder="Key" {...field} />
                {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name={`${fieldName}.${idx}.value` as Path<TFieldValues>}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="flex-1">
                <Input placeholder="Value" {...field} />
                {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
              </Field>
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
      <Controller
        control={form.control}
        name={fieldName as Path<TFieldValues>}
        render={({ fieldState }) => (
          <>
            {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
          </>
        )}
      />
    </div>
  );
};
