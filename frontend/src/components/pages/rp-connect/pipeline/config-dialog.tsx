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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
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
import { type UseFormReturn, useFieldArray, useFormContext } from 'react-hook-form';
import { toast } from 'sonner';
import { applyKeyValueRowChange, keyValueRowsFromFieldArray } from 'utils/key-value-rows';

import { EgressGatewayField } from './egress-gateway-field';
import { MAX_TASKS, MIN_TASKS } from '../tasks';
import { toBadgeGroupItems } from '../utils/badge-group-items';

function TagsField({ readonly }: { readonly?: boolean }) {
  const { control, formState } = useFormContext();
  const tagFields = useFieldArray({ control, name: 'tags' });

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
                <p className="text-body text-muted-foreground">No tags</p>
              ) : (
                <BadgeGroup
                  items={toBadgeGroupItems(filtered, {
                    id: (t) => t.key,
                    text: (t) => `${t.key}: ${t.value}`,
                    content: (t) => (
                      <Badge tone="default" variant="outline">
                        {t.key}: {t.value}
                      </Badge>
                    ),
                  })}
                  maxVisible={5}
                  renderOverflowContent={(overflow) => (
                    <List>
                      {overflow.map((item) => (
                        <ListItem key={item.id}>{item.textValue}</ListItem>
                      ))}
                    </List>
                  )}
                  tone="default"
                  variant="outline"
                />
              )}
            </FormItem>
          );
        }

        const rows = keyValueRowsFromFieldArray(tagFields.fields, tags);

        // Derive per-item errors from the field values directly.
        // With a single FormField for the whole array, RHF may not populate
        // per-item errors, so we compute them to match the Zod schema rules.
        const fieldErrors = rows.map(({ pair }) => {
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
              onChange={(next) =>
                applyKeyValueRowChange(rows, next, {
                  append: tagFields.append,
                  remove: tagFields.remove,
                  edit: field.onChange,
                })
              }
              value={rows}
              valueFieldProps={{ placeholder: 'Value' }}
            />
            {rootError ? <p className="text-body text-destructive">{rootError}</p> : null}
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
            <FormDescription>One compute unit = 0.1 CPU and 400 MB memory</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <EgressGatewayField readonly={readonly} />
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
  const handleSave = form.handleSubmit(() => {
    onOpenChange(false);
  });

  const onSaveClick = () => {
    // Strip empty tag rows before validation
    const tags = form.getValues('tags').filter((t: { key: string; value: string }) => t.key !== '' || t.value !== '');
    form.setValue('tags', tags);
    // Invalid fields report through FormMessage; this catches a resolver or close handler that throws.
    handleSave().catch((error: unknown) => {
      toast.error('Failed to save pipeline settings', { description: String(error) });
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit pipeline settings' : 'Pipeline settings'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Form {...form}>
            <ConfigFields mode={mode} />
          </Form>
        </DialogBody>
        {mode !== 'view' && (
          <DialogFooter>
            <Button onClick={onSaveClick} variant="primary">
              Save settings
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
