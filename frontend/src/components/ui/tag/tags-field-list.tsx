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
  tagFields: Array<{ id: string }>;
  appendTag: (value: { key: string; value: string }) => void;
  removeTag: (index: number) => void;
  fieldName: Path<TFieldValues>;
  fieldNames: (index: number) => { key: Path<TFieldValues>; value: Path<TFieldValues> };
};

/** Key-value tag editor. Drive it from a `useFieldArray` on the tags field. */
export const TagsFieldList = <TFieldValues extends FieldValues>({
  form,
  tagFields,
  appendTag,
  removeTag,
  fieldName,
  fieldNames,
}: TagsFieldListProps<TFieldValues>) => {
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>Tags</FieldLabel>
      <FieldDescription>Key-value pairs for organizing and categorizing</FieldDescription>
      {tagFields.map((f, idx) => (
        <div className="flex items-center gap-2" key={f.id}>
          <Controller
            control={form.control}
            name={fieldNames(idx).key}
            render={({ field, fieldState }) => (
              <Field className="flex-1" data-invalid={fieldState.invalid}>
                <Input placeholder="Key" {...field} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name={fieldNames(idx).value}
            render={({ field, fieldState }) => (
              <Field className="flex-1" data-invalid={fieldState.invalid}>
                <Input placeholder="Value" {...field} />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Button onClick={() => removeTag(idx)} size="icon" type="button" variant="outline">
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button onClick={() => appendTag({ key: '', value: '' })} type="button" variant="dashed">
        <Plus className="size-4" /> Add Tag
      </Button>
      {/* Array-level message for duplicate keys */}
      <Controller
        control={form.control}
        name={fieldName}
        render={({ fieldState }) => <>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</>}
      />
    </div>
  );
};
