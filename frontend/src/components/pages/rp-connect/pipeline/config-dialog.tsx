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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Group } from 'components/redpanda-ui/components/group';
import { Input } from 'components/redpanda-ui/components/input';
import { Slider } from 'components/redpanda-ui/components/slider';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { KeyValueInput } from 'components/ui/key-value-input';
import { PlusIcon, XIcon } from 'lucide-react';
import { Controller, type UseFormReturn, useFieldArray, useFormContext } from 'react-hook-form';

import { MAX_TASKS, MIN_TASKS } from '../tasks';

function TagsField() {
  const { control, formState } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: 'tags' });

  const tagsError = formState.errors.tags;
  const rootError = String(tagsError?.root?.message ?? (tagsError as { message?: string })?.message ?? '');

  return (
    <FormItem>
      <FormLabel>Tags</FormLabel>
      <div className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const tagErrors = (
            formState.errors.tags as
              | Record<number, { key?: { message?: string }; value?: { message?: string } }>
              | undefined
          )?.[index];
          const errorMsg = tagErrors?.key?.message || tagErrors?.value?.message;
          return (
            <div className="flex flex-col gap-1" key={field.id}>
              <Group>
                <Controller
                  control={control}
                  name={`tags.${index}`}
                  render={({ field: controllerField }) => (
                    <KeyValueInput onChange={controllerField.onChange} value={controllerField.value} />
                  )}
                />
                <Button
                  className="shrink-0"
                  onClick={() => remove(index)}
                  size="icon"
                  type="button"
                  variant="secondary-ghost"
                >
                  <XIcon className="size-4" />
                </Button>
              </Group>
              {errorMsg ? <p className="text-destructive text-sm">{errorMsg}</p> : null}
            </div>
          );
        })}
        {rootError ? <p className="text-destructive text-sm">{rootError}</p> : null}
        <Button onClick={() => append({ key: '', value: '' })} size="sm" type="button" variant="ghost">
          <PlusIcon className="size-4" /> Add tag
        </Button>
      </div>
    </FormItem>
  );
}

function ConfigFields() {
  const { control } = useFormContext();

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel required>Pipeline name</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Enter pipeline name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder="Optional description for this pipeline" rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="computeUnits"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Compute units</FormLabel>
            <FormControl>
              <div className="flex items-center gap-2">
                <Slider
                  max={MAX_TASKS}
                  min={MIN_TASKS}
                  onValueChange={(values) => field.onChange(values[0])}
                  step={1}
                  value={[field.value]}
                />
                <Input
                  className="w-12"
                  max={MAX_TASKS}
                  min={MIN_TASKS}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isNaN(value) && value >= MIN_TASKS && value <= MAX_TASKS) {
                      field.onChange(value);
                    }
                  }}
                  showStepControls
                  step={1}
                  type="number"
                  value={field.value}
                />
              </div>
            </FormControl>
            <FormDescription className="text-muted-foreground text-sm">
              One compute unit = 0.1 CPU and 400 MB memory
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <TagsField />
    </div>
  );
}

type ConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // biome-ignore lint/suspicious/noExplicitAny: form type is defined in parent
  form: UseFormReturn<any>;
  mode: 'create' | 'edit' | 'view';
};

export function ConfigDialog({ open, onOpenChange, form, mode }: ConfigDialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      const tags = form.getValues('tags').filter((t: { key: string; value: string }) => t.key !== '' || t.value !== '');
      form.setValue('tags', tags);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent size="full">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Pipeline settings' : 'Edit pipeline settings'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <ConfigFields />
          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={() => onOpenChange(false)} variant="primary">
              Save
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
