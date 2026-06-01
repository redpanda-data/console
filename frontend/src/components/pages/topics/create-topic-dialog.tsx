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
import type React from 'react';
import { useEffect, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { CleanupPolicyType } from './types';
import { isServerless } from '../../../config';
import { useCreateTopicMutation } from '../../../react-query/api/topic';
import { api } from '../../../state/backend-api';
import {
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
import { Field, FieldError, FieldLabel } from '../../redpanda-ui/components/field';
import { Input } from '../../redpanda-ui/components/input';
import { InputGroup, InputGroupButton, InputGroupInput } from '../../redpanda-ui/components/input-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';

// ── Regex ─────────────────────────────────────────────────────────────────────
const DECIMAL_PLACES_REGEX = /\.\d{4,}/;

// ── Schema ────────────────────────────────────────────────────────────────────

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

// ── NumInput ──────────────────────────────────────────────────────────────────

function NumInput(p: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  onBlur?: () => void;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  addonAfter?: React.ReactNode;
  'data-testid'?: string;
}) {
  const [editValue, setEditValue] = useState(p.value === undefined ? undefined : String(p.value));
  useEffect(() => setEditValue(p.value === undefined ? undefined : String(p.value)), [p.value]);

  const commit = (x: number | undefined) => {
    if (p.disabled) return;
    let v = x;
    if (v !== undefined && p.min !== undefined && v < p.min) v = p.min;
    if (v !== undefined && p.max !== undefined && v > p.max) v = p.max;
    setEditValue(v === undefined ? undefined : String(v));
    p.onChange?.(v);
  };

  const input = (
    <Input
      className={p.addonAfter ? 'flex-1 rounded-r-none border-r-0' : undefined}
      data-testid={p['data-testid']}
      disabled={p.disabled}
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
        if (e.target.value !== '' && !Number.isNaN(n)) p.onChange?.(n);
        else p.onChange?.(undefined);
      }}
      onWheel={(e) => commit(Math.round((p.value ?? 0) - Math.sign(e.deltaY)))}
      placeholder={p.placeholder}
      spellCheck={false}
      value={p.disabled && p.placeholder && p.value === undefined ? '' : (editValue ?? '')}
    />
  );

  if (!p.addonAfter) return input;
  return (
    <div className="flex">
      {input}
      {p.addonAfter}
    </div>
  );
}

// ── RetentionTimeSelect ───────────────────────────────────────────────────────

function RetentionTimeSelect(p: {
  value: number;
  unit: RetentionTimeUnit;
  onChangeValue: (v: number) => void;
  onChangeUnit: (u: RetentionTimeUnit) => void;
  defaultConfigValue?: string;
  'data-testid'?: string;
}) {
  const { value, unit } = p;
  const numDisabled = unit === 'default' || unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'default' && p.defaultConfigValue != null) {
    placeholder = Number.isFinite(Number(p.defaultConfigValue))
      ? prettyMilliseconds(p.defaultConfigValue, {
          showLargeAsInfinite: true,
          showNullAs: 'default',
          verbose: true,
          unitCount: 2,
        })
      : 'default';
  }
  if (unit === 'infinite') placeholder = 'Infinite';

  const options = Object.entries(timeFactors).map(([name]) => ({
    value: name as RetentionTimeUnit,
    label: name === 'default' || name === 'infinite' ? titleCase(name) : name,
  }));

  return (
    <NumInput
      addonAfter={
        <Select
          onValueChange={(u) => {
            const newUnit = u as RetentionTimeUnit;
            if (newUnit === 'default') {
              p.onChangeValue(value * timeFactors[unit]);
            } else {
              const factor = unit === 'default' ? 1 : timeFactors[unit];
              const ms = value * factor;
              let newValue = ms / timeFactors[newUnit];
              if (Number.isNaN(newValue)) newValue = 0;
              if (DECIMAL_PLACES_REGEX.test(String(newValue))) newValue = Math.round(newValue);
              p.onChangeValue(newValue);
            }
            p.onChangeUnit(newUnit);
          }}
          value={unit}
        >
          <SelectTrigger className="w-[130px] rounded-l-none">
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
      }
      data-testid={p['data-testid']}
      disabled={numDisabled}
      min={0}
      onChange={(x) => p.onChangeValue(x ?? 0)}
      placeholder={placeholder}
      value={numDisabled ? undefined : value}
    />
  );
}

// ── RetentionSizeSelect ───────────────────────────────────────────────────────

function RetentionSizeSelect(p: {
  value: number;
  unit: RetentionSizeUnit;
  onChangeValue: (v: number) => void;
  onChangeUnit: (u: RetentionSizeUnit) => void;
  defaultConfigValue?: string;
  'data-testid'?: string;
}) {
  const { value, unit } = p;
  const numDisabled = unit === 'default' || unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'default') {
    placeholder =
      p.defaultConfigValue && Number.isFinite(Number(p.defaultConfigValue))
        ? prettyBytes(p.defaultConfigValue, { showLargeAsInfinite: true, showNullAs: 'default' })
        : 'default';
  }
  if (unit === 'infinite') placeholder = 'Infinite';

  const options = Object.entries(sizeFactors).map(([name]) => ({
    value: name as RetentionSizeUnit,
    label: name === 'default' || name === 'infinite' ? titleCase(name) : name,
  }));

  return (
    <NumInput
      addonAfter={
        <Select
          onValueChange={(u) => {
            const newUnit = u as RetentionSizeUnit;
            if (newUnit === 'default') {
              p.onChangeValue(value * sizeFactors[unit]);
            } else {
              const factor = unit === 'default' ? 1 : sizeFactors[unit];
              const bytes = value * factor;
              let newValue = bytes / sizeFactors[newUnit];
              if (Number.isNaN(newValue)) newValue = 0;
              if (DECIMAL_PLACES_REGEX.test(String(newValue))) newValue = Math.round(newValue);
              p.onChangeValue(newValue);
            }
            p.onChangeUnit(newUnit);
          }}
          value={unit}
        >
          <SelectTrigger className="w-[130px] rounded-l-none">
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
      }
      data-testid={p['data-testid']}
      disabled={numDisabled}
      min={0}
      onChange={(x) => p.onChangeValue(x ?? -1)}
      placeholder={placeholder}
      value={numDisabled ? undefined : value}
    />
  );
}

// ── Form content ──────────────────────────────────────────────────────────────

type FormContentProps = {
  form: ReturnType<typeof useForm<CreateTopicFormValues>>;
  tryGetBrokerConfig: (name: string) => string | undefined;
};

function CreateTopicDialogContent({ form, tryGetBrokerConfig }: FormContentProps) {
  const { control, watch, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'additionalConfig' });

  return (
    <div className="flex flex-col gap-6">
      {/* Topic Name */}
      <Controller
        control={control}
        name="topicName"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel required>Topic Name</FieldLabel>
            <Input data-testid="topic-name" {...field} />
            {fieldState.error && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      {/* Partitions · Replication Factor · Min ISR */}
      <div className="flex flex-wrap gap-6">
        <div className="flex-1" style={{ minWidth: '140px', maxWidth: '180px' }}>
          <Controller
            control={control}
            name="partitions"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Partitions</FieldLabel>
                <NumInput
                  data-testid="topic-partitions"
                  min={1}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  placeholder={tryGetBrokerConfig('num.partitions')}
                  value={field.value}
                />
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        <div className="flex-1" style={{ minWidth: '140px', maxWidth: '180px' }}>
          <Controller
            control={control}
            name="replicationFactor"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Replication Factor</FieldLabel>
                <NumInput
                  data-testid="topic-replication-factor"
                  disabled={isServerless()}
                  min={1}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  placeholder={tryGetBrokerConfig('default.replication.factor')}
                  value={field.value}
                />
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </div>

        {!api.isRedpanda && (
          <div className="flex-1" style={{ minWidth: '140px', maxWidth: '180px' }}>
            <Controller
              control={control}
              name="minInSyncReplicas"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Min In-Sync Replicas</FieldLabel>
                  <NumInput
                    data-testid="topic-min-insync-replicas"
                    min={1}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    placeholder={tryGetBrokerConfig('min.insync.replicas') ?? '1'}
                    value={field.value}
                  />
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </div>
        )}
      </div>

      {/* Cleanup Policy · Retention Time · Retention Size */}
      <div className="flex flex-wrap gap-6">
        {!isServerless() && (
          <div style={{ flexBasis: '150px' }}>
            <Controller
              control={control}
              name="cleanupPolicy"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Cleanup Policy</FieldLabel>
                  <Select onValueChange={(v) => field.onChange(v as CleanupPolicyType)} value={field.value}>
                    <SelectTrigger data-testid="cleanup-policy-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="delete">delete</SelectItem>
                      <SelectItem value="compact">compact</SelectItem>
                      <SelectItem value="compact,delete">compact,delete</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldState.error && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5" style={{ flexBasis: '220px', flexGrow: 1 }}>
          <FieldLabel>Retention Time</FieldLabel>
          <RetentionTimeSelect
            data-testid="topic-retention-time"
            defaultConfigValue={tryGetBrokerConfig('log.retention.ms')}
            onChangeUnit={(u) => setValue('retentionTimeUnit', u)}
            onChangeValue={(v) => setValue('retentionTimeMs', v)}
            unit={watch('retentionTimeUnit') as RetentionTimeUnit}
            value={watch('retentionTimeMs')}
          />
        </div>

        <div className="flex flex-col gap-1.5" style={{ flexBasis: '220px', flexGrow: 1 }}>
          <FieldLabel>Retention Size</FieldLabel>
          <RetentionSizeSelect
            data-testid="topic-retention-size"
            defaultConfigValue={tryGetBrokerConfig('log.retention.bytes')}
            onChangeUnit={(u) => setValue('retentionSizeUnit', u)}
            onChangeValue={(v) => setValue('retentionSize', v)}
            unit={watch('retentionSizeUnit') as RetentionSizeUnit}
            value={watch('retentionSize')}
          />
        </div>
      </div>

      {/* Additional Configuration */}
      {!isServerless() && (
        <div className="flex flex-col gap-2">
          <FieldLabel>Additional Configuration</FieldLabel>
          <div className="flex flex-col gap-2">
            {fields.map((fieldItem, i) => (
              <InputGroup key={fieldItem.id}>
                <Controller
                  control={control}
                  name={`additionalConfig.${i}.name`}
                  render={({ field }) => (
                    <InputGroupInput {...field} className="w-[30%]" placeholder="Property Name..." spellCheck={false} />
                  )}
                />
                <Controller
                  control={control}
                  name={`additionalConfig.${i}.value`}
                  render={({ field }) => (
                    <InputGroupInput {...field} className="flex-1" placeholder="Property Value..." spellCheck={false} />
                  )}
                />
                <InputGroupButton
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(i);
                  }}
                  type="button"
                  variant="ghost"
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroup>
            ))}
            <div>
              <Button onClick={() => append({ name: '', value: '' })} size="sm" type="button" variant="outline">
                <PlusIcon />
                Add Entry
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CreateTopicDialog ─────────────────────────────────────────────────────────

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
  }, []);

  useEffect(() => {
    if (isOpen) {
      api.refreshCluster();
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
      const config: { name: string; value: string }[] = [];
      const setVal = (name: string, value: string | number | undefined) => {
        if (value === undefined) return;
        config.removeAll((x) => x.name === name);
        config.push({ name, value: String(value) });
      };

      for (const x of values.additionalConfig) setVal(x.name, x.value);
      if (values.retentionTimeUnit !== 'default')
        setVal(
          'retention.ms',
          getRetentionTimeFinalValue(values.retentionTimeMs, values.retentionTimeUnit as RetentionTimeUnit)
        );
      if (values.retentionSizeUnit !== 'default')
        setVal(
          'retention.bytes',
          getRetentionSizeFinalValue(values.retentionSize, values.retentionSizeUnit as RetentionSizeUnit)
        );
      if (values.minInSyncReplicas !== undefined) setVal('min.insync.replicas', values.minInSyncReplicas);
      setVal('cleanup.policy', values.cleanupPolicy);

      const apiResult = await createTopic({
        topic: {
          name: values.topicName,
          partitionCount: values.partitions ?? Number(tryGetBrokerConfig('num.partitions') ?? '-1'),
          replicationFactor:
            values.replicationFactor ?? Number(tryGetBrokerConfig('default.replication.factor') ?? '-1'),
          configs: config.filter((x) => x.name.length > 0).map((x) => ({ name: x.name, value: x.value })),
        },
        validateOnly: false,
      });

      setResult({
        topicName: apiResult.topicName,
        partitionCount: apiResult.partitionCount,
        replicationFactor: apiResult.replicationFactor,
      });
      api.refreshClusterOverview();
      api.refreshClusterHealth().catch(() => {});
    } catch (e) {
      setResult({ error: e });
    } finally {
      setIsLoading(false);
    }
  };

  const isSuccess = result && !result.error;
  const isError = Boolean(result?.error);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      open={isOpen}
    >
      <DialogContent
        style={isSuccess ? { maxWidth: '440px' } : { minWidth: '600px', maxWidth: '1000px', width: '80%' }}
      >
        <DialogHeader>
          <DialogTitle>{isSuccess ? 'Topic created' : 'Create Topic'}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          {isError && result && (
            <Alert className="mb-4" variant="destructive">
              <AlertTitle>{result.error instanceof Error ? result.error.name : 'Error'}</AlertTitle>
              <AlertDescription>
                <code className="font-mono text-xs">
                  {result.error instanceof Error ? result.error.message : JSON.stringify(result.error, null, 2)}
                </code>
              </AlertDescription>
            </Alert>
          )}

          {isSuccess ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircleIcon className="h-7 w-7 text-green-500" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-base">Topic created</p>
                <p className="text-muted-foreground text-sm">Your topic is ready to use.</p>
              </div>
              <div className="w-full rounded-lg border-t bg-white p-6 dark:bg-base-900">
                <div className="mb-3 flex flex-col items-center gap-0.5">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Topic name</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CopyButton
                          className="max-w-[320px]"
                          content={result.topicName ?? ''}
                          size="sm"
                          variant="ghost"
                        >
                          <span className="truncate font-mono">{result.topicName}</span>
                        </CopyButton>
                      </TooltipTrigger>
                      {(result.topicName?.length ?? 0) > 40 && <TooltipContent>{result.topicName}</TooltipContent>}
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex justify-center gap-8 pt-3 text-sm">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-semibold">{String(result.partitionCount).replace('-1', '—')}</span>
                    <span className="text-muted-foreground text-xs">Partitions</span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="font-semibold">{String(result.replicationFactor).replace('-1', '—')}</span>
                    <span className="text-muted-foreground text-xs">Replication factor</span>
                  </div>
                </div>
              </div>
            </div>
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
              <Button asChild data-testid="create-topic-success__go-to-topic-button">
                <Link
                  params={{ topicName: encodeURIComponent(result?.topicName ?? '') }}
                  search={{} as never}
                  to="/topics/$topicName"
                >
                  Go to topic
                </Link>
              </Button>
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

// ── Value helpers ─────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
function getRetentionTimeFinalValue(value: number | undefined, unit: RetentionTimeUnit) {
  if (unit === 'default') return;
  if (value === undefined)
    throw new Error(`unexpected: value for retention time is 'undefined' but unit is set to ${unit}`);
  if (unit === 'ms') return value;
  if (unit === 'seconds') return value * 1000;
  if (unit === 'minutes') return value * 1000 * 60;
  if (unit === 'hours') return value * 1000 * 60 * 60;
  if (unit === 'days') return value * 1000 * 60 * 60 * 24;
  if (unit === 'months') return value * 1000 * 60 * 60 * 24 * (365 / 12);
  if (unit === 'years') return value * 1000 * 60 * 60 * 24 * 365;
  if (unit === 'infinite') return -1;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
function getRetentionSizeFinalValue(value: number | undefined, unit: RetentionSizeUnit) {
  if (unit === 'default') return;
  if (value === undefined)
    throw new Error(`unexpected: value for retention size is 'undefined' but unit is set to ${unit}`);
  if (unit === 'Bit') return value;
  if (unit === 'KiB') return value * 1024;
  if (unit === 'MiB') return value * 1024 * 1024;
  if (unit === 'GiB') return value * 1024 * 1024 * 1024;
  if (unit === 'TiB') return value * 1024 * 1024 * 1024 * 1024;
  if (unit === 'infinite') return -1;
}
