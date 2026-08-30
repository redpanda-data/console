/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import { CheckCircleIcon, PlusIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { CleanupPolicyType } from './types';
import { isServerless } from '../../../config';
import { useCreateTopicMutation } from '../../../react-query/api/topic';
import { api } from '../../../state/backend-api';
import {
  getRetentionSizeFinalValue,
  getRetentionTimeFinalValue,
  type RetentionSizeUnit,
  type RetentionTimeUnit,
  sizeFactors,
  timeFactors,
  validateReplicationFactor,
} from '../../../utils/topic-utils';
import { prettyBytes, prettyMilliseconds, titleCase } from '../../../utils/utils';
import { Alert, AlertDescription, AlertTitle } from '../../redpanda-ui/components/alert';
import { Button } from '../../redpanda-ui/components/button';
import { CopyButton } from '../../redpanda-ui/components/copy-button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../redpanda-ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../redpanda-ui/components/field';
import { Group } from '../../redpanda-ui/components/group';
import { Input } from '../../redpanda-ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';

const DECIMAL_PLACES_REGEX = /\.\d{4,}/;

const createTopicFormSchema = z
  .object({
    topicName: z.string().min(1, 'Topic name is required').regex(/^\S+$/, 'Topic name cannot contain spaces'),
    partitions: z.number().int().min(1, 'Must be at least 1').optional(),
    replicationFactor: z.number().int().min(1, 'Must be at least 1').optional(),
    minInSyncReplicas: z.number().int().min(1, 'Must be at least 1').optional(),
    cleanupPolicy: z.enum(['delete', 'compact', 'compact,delete'] as const),
    retentionTimeMs: z.number(),
    retentionTimeUnit: z.string(),
    retentionSize: z.number(),
    retentionSizeUnit: z.string(),
    additionalConfig: z.array(z.object({ name: z.string(), value: z.string() })),
  })
  .superRefine((data, ctx) => {
    if (data.replicationFactor !== undefined && api.clusterOverview) {
      const err = validateReplicationFactor(data.replicationFactor, api.isRedpanda);
      if (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ['replicationFactor'] });
      }
    }
  });

type CreateTopicFormValues = z.infer<typeof createTopicFormSchema>;

function NumInput(p: {
  id?: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  onBlur?: () => void;
  placeholder?: string;
  min?: number;
  disabled?: boolean;
  containerClassName?: string;
  'data-testid'?: string;
}) {
  const [editValue, setEditValue] = useState(p.value === undefined ? undefined : String(p.value));
  useEffect(() => setEditValue(p.value === undefined ? undefined : String(p.value)), [p.value]);

  const commit = (x: number | undefined) => {
    if (p.disabled) {
      return;
    }
    const v = x !== undefined && p.min !== undefined && x < p.min ? p.min : x;
    setEditValue(v === undefined ? undefined : String(v));
    p.onChange(v);
  };

  return (
    <Input
      autoComplete="off"
      containerClassName={p.containerClassName}
      data-testid={p['data-testid']}
      disabled={p.disabled}
      id={p.id}
      inputMode="numeric"
      onBlur={() => {
        if (!editValue) {
          commit(undefined);
          setEditValue('');
          return;
        }
        const n = Number(editValue);
        if (!Number.isFinite(n)) {
          commit(undefined);
          setEditValue('');
          return;
        }
        commit(n);
        p.onBlur?.();
      }}
      onChange={(e) => {
        setEditValue(e.target.value);
        const n = Number(e.target.value);
        p.onChange(e.target.value !== '' && !Number.isNaN(n) ? n : undefined);
      }}
      placeholder={p.placeholder}
      spellCheck={false}
      value={p.disabled && p.placeholder && p.value === undefined ? '' : (editValue ?? '')}
    />
  );
}

/**
 * Numeric retention value paired with its unit, e.g. `[ 7 ][ days ]`. Selecting `default` or
 * `infinite` disables the number box, which then shows the effective value as a placeholder.
 */
function RetentionSelect<U extends string>(p: {
  id?: string;
  label: string;
  value: number;
  unit: U;
  factors: Record<U, number>;
  /** Pretty-prints the broker-level default for the placeholder. */
  formatDefault: (rawConfigValue: string) => string;
  /** Value to fall back to when the number box is cleared. */
  clearedValue: number;
  onChangeValue: (v: number) => void;
  onChangeUnit: (u: U) => void;
  defaultConfigValue?: string;
  /** The unit picker derives its own testid from this, so it is required. */
  'data-testid': string;
}) {
  const { value, unit, factors } = p;
  const numDisabled = unit === 'default' || unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'default') {
    placeholder =
      p.defaultConfigValue && Number.isFinite(Number(p.defaultConfigValue))
        ? p.formatDefault(p.defaultConfigValue)
        : 'default';
  }
  if (unit === 'infinite') {
    placeholder = 'Infinite';
  }

  const options = (Object.keys(factors) as U[]).map((name) => ({
    value: name,
    label: name === 'default' || name === 'infinite' ? titleCase(name) : name,
  }));

  return (
    <Group attached>
      <NumInput
        containerClassName="min-w-0 flex-1"
        data-testid={p['data-testid']}
        disabled={numDisabled}
        id={p.id}
        min={0}
        onChange={(x) => p.onChangeValue(x ?? p.clearedValue)}
        placeholder={placeholder}
        value={numDisabled ? undefined : value}
      />
      <Select
        items={options}
        onValueChange={(u) => {
          const newUnit = u as U;
          if (newUnit === 'default') {
            p.onChangeValue(value * factors[unit]);
          } else {
            const factor = unit === 'default' ? 1 : factors[unit];
            let newValue = (value * factor) / factors[newUnit];
            if (Number.isNaN(newValue)) {
              newValue = 0;
            }
            if (DECIMAL_PLACES_REGEX.test(String(newValue))) {
              newValue = Math.round(newValue);
            }
            p.onChangeValue(newValue);
          }
          p.onChangeUnit(newUnit);
        }}
        value={unit}
      >
        <SelectTrigger
          aria-label={`${p.label} unit`}
          className="w-28 shrink-0 border-l"
          data-testid={`${p['data-testid']}-unit`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Group>
  );
}

type FormContentProps = {
  form: ReturnType<typeof useForm<CreateTopicFormValues>>;
  tryGetBrokerConfig: (name: string) => string | undefined;
};

function CreateTopicDialogContent({ form, tryGetBrokerConfig }: FormContentProps) {
  const { control, watch, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'additionalConfig' });
  const serverless = isServerless();

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
      <Controller
        control={control}
        name="topicName"
        render={({ field, fieldState }) => (
          <Field className="sm:col-span-2" data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="create-topic-name" required>
              Topic name
            </FieldLabel>
            <Input
              autoComplete="off"
              data-testid="topic-name"
              id="create-topic-name"
              placeholder="e.g. orders"
              spellCheck={false}
              {...field}
            />
            <FieldDescription>Letters, numbers, dots, underscores, and hyphens.</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="partitions"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="create-topic-partitions">Partitions</FieldLabel>
            <NumInput
              data-testid="topic-partitions"
              id="create-topic-partitions"
              min={1}
              onBlur={field.onBlur}
              onChange={field.onChange}
              placeholder={tryGetBrokerConfig('num.partitions')}
              value={field.value}
            />
            <FieldDescription>More partitions allow more consumers.</FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="replicationFactor"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="create-topic-replication">Replication factor</FieldLabel>
            <NumInput
              data-testid="topic-replication-factor"
              disabled={serverless}
              id="create-topic-replication"
              min={1}
              onBlur={field.onBlur}
              onChange={field.onChange}
              placeholder={tryGetBrokerConfig('default.replication.factor')}
              value={field.value}
            />
            <FieldDescription>
              {serverless ? 'Managed automatically for Serverless.' : 'Copies of each partition across brokers.'}
            </FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {!api.isRedpanda && (
        <Controller
          control={control}
          name="minInSyncReplicas"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="create-topic-min-isr">Min in-sync replicas</FieldLabel>
              <NumInput
                data-testid="topic-min-insync-replicas"
                id="create-topic-min-isr"
                min={1}
                onBlur={field.onBlur}
                onChange={field.onChange}
                placeholder={tryGetBrokerConfig('min.insync.replicas') ?? '1'}
                value={field.value}
              />
              <FieldDescription>Replicas that have to acknowledge a write.</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

      {!serverless && (
        <Controller
          control={control}
          name="cleanupPolicy"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="create-topic-cleanup-policy">Cleanup policy</FieldLabel>
              <Select onValueChange={(v) => field.onChange(v as CleanupPolicyType)} value={field.value}>
                <SelectTrigger data-testid="cleanup-policy-select" id="create-topic-cleanup-policy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delete">delete</SelectItem>
                  <SelectItem value="compact">compact</SelectItem>
                  <SelectItem value="compact,delete">compact,delete</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>How old segments are removed.</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      )}

      {/* col-start-1 keeps the retention pair together on its own row when the fields above wrap unevenly. */}
      <Field className="sm:col-start-1">
        <FieldLabel htmlFor="create-topic-retention-time">Retention time</FieldLabel>
        <RetentionSelect
          clearedValue={0}
          data-testid="topic-retention-time"
          defaultConfigValue={tryGetBrokerConfig('log.retention.ms')}
          factors={timeFactors}
          formatDefault={(raw) =>
            prettyMilliseconds(raw, {
              showLargeAsInfinite: true,
              showNullAs: 'default',
              verbose: true,
              unitCount: 2,
            })
          }
          id="create-topic-retention-time"
          label="Retention time"
          onChangeUnit={(u) => setValue('retentionTimeUnit', u)}
          onChangeValue={(v) => setValue('retentionTimeMs', v)}
          unit={watch('retentionTimeUnit') as RetentionTimeUnit}
          value={watch('retentionTimeMs')}
        />
        <FieldDescription>How long records are kept.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="create-topic-retention-size">Retention size</FieldLabel>
        <RetentionSelect
          clearedValue={-1}
          data-testid="topic-retention-size"
          defaultConfigValue={tryGetBrokerConfig('log.retention.bytes')}
          factors={sizeFactors}
          formatDefault={(raw) => prettyBytes(raw, { showLargeAsInfinite: true, showNullAs: 'default' })}
          id="create-topic-retention-size"
          label="Retention size"
          onChangeUnit={(u) => setValue('retentionSizeUnit', u)}
          onChangeValue={(v) => setValue('retentionSize', v)}
          unit={watch('retentionSizeUnit') as RetentionSizeUnit}
          value={watch('retentionSize')}
        />
        <FieldDescription>Maximum size kept per partition.</FieldDescription>
      </Field>

      {!serverless && (
        <Field className="sm:col-span-2 sm:col-start-1">
          <FieldLabel>Additional configuration</FieldLabel>
          <FieldDescription>Optional topic-level overrides, such as compression or segment size.</FieldDescription>
          <div className="flex flex-col gap-2">
            {fields.map((fieldItem, i) => (
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-2" key={fieldItem.id}>
                <Controller
                  control={control}
                  name={`additionalConfig.${i}.name`}
                  render={({ field }) => (
                    <Input
                      {...field}
                      aria-label="Property name"
                      autoComplete="off"
                      placeholder="Property Name..."
                      spellCheck={false}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`additionalConfig.${i}.value`}
                  render={({ field }) => (
                    <Input
                      {...field}
                      aria-label="Property value"
                      autoComplete="off"
                      placeholder="Property Value..."
                      spellCheck={false}
                    />
                  )}
                />
                <Button
                  aria-label="Remove entry"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => remove(i)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <Button
              className="w-fit"
              onClick={() => append({ name: '', value: '' })}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlusIcon />
              Add entry
            </Button>
          </div>
        </Field>
      )}
    </div>
  );
}

/** Long names get a tooltip because the copy button truncates them. */
const TOOLTIP_NAME_LENGTH = 40;

/** Server-reported `-1` means "cluster default", which has no meaningful number to show. */
const formatCount = (count?: number) => (count === undefined || count === -1 ? '—' : String(count));

function TopicCreatedPanel({
  topicName,
  partitionCount,
  replicationFactor,
}: {
  topicName?: string;
  partitionCount?: number;
  replicationFactor?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-success-strong/10">
        <CheckCircleIcon className="size-6 text-success" />
      </div>
      <p className="text-body text-muted-foreground">Your topic is ready to use.</p>
      <div className="w-full rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-col items-center gap-0.5">
          <p className="font-medium text-body-sm text-muted-foreground uppercase tracking-wide">Topic name</p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <CopyButton className="max-w-[320px]" content={topicName ?? ''} size="sm" variant="ghost">
                    <span className="truncate font-mono">{topicName}</span>
                  </CopyButton>
                }
              />
              {(topicName?.length ?? 0) > TOOLTIP_NAME_LENGTH ? <TooltipContent>{topicName}</TooltipContent> : null}
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="mt-3 flex justify-center gap-10 border-t pt-3 text-body">
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-semibold">{formatCount(partitionCount)}</span>
            <span className="text-body-sm text-muted-foreground">Partitions</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-semibold">{formatCount(replicationFactor)}</span>
            <span className="text-body-sm text-muted-foreground">Replication factor</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Flattens the retention/policy fields and user-entered overrides into topic config entries. */
function buildTopicConfigs(values: CreateTopicFormValues) {
  const config: { name: string; value: string }[] = [];
  const setVal = (name: string, value: string | number | undefined) => {
    if (value === undefined) {
      return;
    }
    config.removeAll((x) => x.name === name);
    config.push({ name, value: String(value) });
  };

  for (const x of values.additionalConfig) {
    setVal(x.name, x.value);
  }
  if (values.retentionTimeUnit !== 'default') {
    setVal(
      'retention.ms',
      getRetentionTimeFinalValue(values.retentionTimeMs, values.retentionTimeUnit as RetentionTimeUnit)
    );
  }
  if (values.retentionSizeUnit !== 'default') {
    setVal(
      'retention.bytes',
      getRetentionSizeFinalValue(values.retentionSize, values.retentionSizeUnit as RetentionSizeUnit)
    );
  }
  if (values.minInSyncReplicas !== undefined) {
    setVal('min.insync.replicas', values.minInSyncReplicas);
  }
  setVal('cleanup.policy', values.cleanupPolicy);

  return config.filter((x) => x.name.length > 0);
}

export function CreateTopicDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { mutateAsync: createTopic } = useCreateTopicMutation();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    error?: unknown;
    topicName?: string;
    partitionCount?: number;
    replicationFactor?: number;
  } | null>(null);

  const tryGetBrokerConfig = (configName: string): string | undefined =>
    api.clusterInfo?.brokers?.find(() => true)?.config.configs?.find((x) => x.name === configName)?.value ?? undefined;

  const form = useForm<CreateTopicFormValues>({
    resolver: zodResolver(createTopicFormSchema),
    defaultValues: {
      topicName: '',
      cleanupPolicy: 'delete',
      retentionTimeMs: 1,
      retentionTimeUnit: 'default',
      retentionSize: 1,
      retentionSizeUnit: 'default',
      additionalConfig: [{ name: '', value: '' }],
    },
    mode: 'onChange',
  });

  useEffect(() => {
    api.refreshCluster();
    api.refreshClusterOverview();
  }, []);

  useEffect(() => {
    if (isOpen) {
      api.refreshCluster();
      api.refreshClusterOverview();
      form.reset();
      setResult(null);
    }
  }, [isOpen, form]);

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  const onSubmit = async (values: CreateTopicFormValues) => {
    setResult(null);
    setIsLoading(true);
    try {
      const apiResult = await createTopic({
        topic: {
          name: values.topicName,
          partitionCount: values.partitions ?? Number(tryGetBrokerConfig('num.partitions') ?? '-1'),
          replicationFactor:
            values.replicationFactor ?? Number(tryGetBrokerConfig('default.replication.factor') ?? '-1'),
          configs: buildTopicConfigs(values),
        },
        validateOnly: false,
      });

      setResult({
        topicName: apiResult.topicName,
        partitionCount: apiResult.partitionCount,
        replicationFactor: apiResult.replicationFactor,
      });
      api.refreshClusterOverview();
      api.refreshClusterHealth().catch(() => {
        // Best-effort refresh; the topic was created either way.
      });
    } catch (e) {
      setResult({ error: e });
    } finally {
      setIsLoading(false);
    }
  };

  // Not `Boolean(...)`: the truthiness check narrows `result` to non-null for the success branch below.
  const isSuccess = result && !result.error;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
      open={isOpen}
    >
      <DialogContent size={isSuccess ? 'md' : 'lg'}>
        <DialogHeader>
          <DialogTitle>{isSuccess ? 'Topic created' : 'Create topic'}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {result?.error ? (
            <Alert variant="destructive">
              <AlertTitle>{result.error instanceof Error ? result.error.name : 'Error'}</AlertTitle>
              <AlertDescription>
                <code className="font-mono text-body-sm">
                  {result.error instanceof Error ? result.error.message : JSON.stringify(result.error, null, 2)}
                </code>
              </AlertDescription>
            </Alert>
          ) : null}

          {isSuccess ? (
            <TopicCreatedPanel
              partitionCount={result.partitionCount}
              replicationFactor={result.replicationFactor}
              topicName={result.topicName}
            />
          ) : (
            <form id="create-topic-form" onSubmit={form.handleSubmit(onSubmit)}>
              <CreateTopicDialogContent form={form} tryGetBrokerConfig={tryGetBrokerConfig} />
            </form>
          )}
        </DialogBody>

        <DialogFooter>
          {isSuccess ? (
            <>
              <Button data-testid="create-topic-success__close-button" onClick={handleClose} variant="outline">
                Close
              </Button>
              <Button
                data-testid="create-topic-success__go-to-topic-button"
                render={
                  <Link
                    params={{ topicName: encodeURIComponent(result?.topicName ?? '') }}
                    search={{} as never}
                    to="/topics/$topicName"
                  >
                    Go to topic
                  </Link>
                }
              />
            </>
          ) : (
            <>
              <Button onClick={handleClose} variant="outline">
                Cancel
              </Button>
              <Button
                data-testid="onOk-button"
                disabled={!form.formState.isValid || isLoading}
                form="create-topic-form"
                type="submit"
              >
                {isLoading ? 'Creating…' : 'Create'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
