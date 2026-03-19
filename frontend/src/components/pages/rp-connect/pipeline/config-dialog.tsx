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

import { Badge } from 'components/redpanda-ui/components/badge';
import { BadgeGroup } from 'components/redpanda-ui/components/badge-group';
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
import { Input } from 'components/redpanda-ui/components/input';
import { KeyValueField } from 'components/redpanda-ui/components/key-value-field';
import { Slider } from 'components/redpanda-ui/components/slider';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { List, ListItem } from 'components/redpanda-ui/components/typography';
import { type UseFormReturn, useFormContext } from 'react-hook-form';

import { MAX_TASKS, MIN_TASKS } from '../tasks';

function TagsField({ readonly }: { readonly?: boolean }) {
  const { control, formState } = useFormContext();

  const tagsError = formState.errors.tags;
  const rootError = String(tagsError?.root?.message ?? (tagsError as { message?: string })?.message ?? '');

  return (
    <FormField
      control={control}
      name="tags"
      render={({ field }) => {
        const tags = (field.value ?? []) as Array<{ key: string; value: string }>;
        const filtered = tags.filter((t) => t.key);

        if (readonly) {
          return (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              {filtered.length === 0 ? (
                <p className="text-muted-foreground text-sm">No tags</p>
              ) : (
                <BadgeGroup
                  maxVisible={5}
                  renderOverflowContent={(overflow) => (
                    <List>
                      {filtered.slice(-overflow.length).map((t) => (
                        <ListItem key={t.key}>
                          {t.key}: {t.value}
                        </ListItem>
                      ))}
                    </List>
                  )}
                  variant="simple-outline"
                >
                  {filtered.map((t) => (
                    <Badge key={t.key} variant="simple-outline">
                      {t.key}: {t.value}
                    </Badge>
                  ))}
                </BadgeGroup>
              )}
            </FormItem>
          );
        }

        // Seed with one empty row so the add button is always visible
        const editableValue = field.value && field.value.length > 0 ? field.value : [{ key: '', value: '' }];

        // Derive per-item errors from the field values directly.
        // With a single FormField for the whole array, RHF may not populate
        // per-item errors, so we compute them to match the Zod schema rules.
        const fieldErrors = editableValue.map((pair: { key: string; value: string }) => {
          const hasKey = pair.key.length > 0;
          const hasValue = pair.value.length > 0;
          if (!(hasKey || hasValue)) {
            return;
          }
          return {
            key: !hasKey && hasValue ? 'Key is required' : undefined,
            value: hasKey && !hasValue ? 'Value is required' : undefined,
          };
        });

        return (
          <FormItem>
            <KeyValueField
              addButtonLabel="Add tag"
              errors={fieldErrors}
              keyFieldProps={{ placeholder: 'Key' }}
              label="Tags"
              onChange={field.onChange}
              value={editableValue}
              valueFieldProps={{ placeholder: 'Value' }}
            />
            {rootError ? <p className="text-destructive text-sm">{rootError}</p> : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function ConfigFields({ mode }: { mode: 'create' | 'edit' | 'view' }) {
  const { control } = useFormContext();
  const readonly = mode === 'view';

  return (
    <div className="space-y-8">
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel required>Pipeline name</FormLabel>
            <FormControl>
              <Input {...field} disabled={readonly} placeholder="Enter pipeline name" />
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
              <Textarea {...field} disabled={readonly} placeholder="Optional description for this pipeline" rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <TagsField readonly={readonly} />

      <FormField
        control={control}
        name="computeUnits"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Compute units</FormLabel>
            <FormControl>
              <div className="flex items-center gap-2">
                <Slider
                  disabled={readonly}
                  max={MAX_TASKS}
                  min={MIN_TASKS}
                  onValueChange={(values) => field.onChange(values[0])}
                  step={1}
                  value={[field.value]}
                />
                <Input
                  className="w-12"
                  disabled={readonly}
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
  const handleSave = async () => {
    // Strip empty tag rows before validation
    const tags = form.getValues('tags').filter((t: { key: string; value: string }) => t.key !== '' || t.value !== '');
    form.setValue('tags', tags);

    const isValid = await form.trigger();
    if (isValid) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Pipeline settings' : mode === 'view' ? 'Pipeline settings' : 'Edit pipeline settings'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <ConfigFields mode={mode} />
          {mode !== 'view' && (
            <div className="flex justify-end gap-2 pt-4">
              <Button onClick={handleSave} variant="primary">
                Save
              </Button>
            </div>
          )}
        </Form>
      </DialogContent>
    </Dialog>
  );
}
