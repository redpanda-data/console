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

import { convertRetentionValue } from './convert-retention-value';
import type { CleanupPolicyType } from './types';
import { isServerless } from '../../../config';
import { KafkaDistribution } from '../../../protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import { useCreateTopicMutation } from '../../../react-query/api/topic';
import { api, useApiStoreHook } from '../../../state/backend-api';
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
import { FenceGuardedButton } from '../../cluster-fence/fence-guarded-controls';
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
import { TonedIcon } from '../shared/toned-icon';

const createTopicFormSchema = z
  .object({
    topicName: z
      .string()
      .min(1, 'Topic name is required')
      .max(249, 'Topic name must be 249 characters or fewer')
      .regex(/^\S*$/u, 'Topic name cannot contain spaces')
      .regex(/^[a-zA-Z0-9._-]*$/u, 'Use only letters, numbers, dots, underscores, and hyphens')
      .refine((name) => name !== '.' && name !== '..', 'Topic name cannot be . or ..'),
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
        const n = editValue ? Number(editValue) : Number.NaN;
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

function RetentionSelect<U extends string>(p: {
  id?: string;
  label: string;
  value: number;
  unit: U;
  factors: Record<U, number>;
  formatDefaultPlaceholder: (rawConfigValue: string) => string;
  valueWhenCleared: number;
  onChangeValue: (v: number) => void;
  onChangeUnit: (u: U) => void;
  defaultConfigValue?: string;
  'data-testid': string;
}) {
  const { value, unit, factors } = p;
  const numDisabled = unit === 'default' || unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'default') {
    placeholder =
      p.defaultConfigValue && Number.isFinite(Number(p.defaultConfigValue))
        ? p.formatDefaultPlaceholder(p.defaultConfigValue)
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
        onChange={(x) => p.onChangeValue(x ?? p.valueWhenCleared)}
        placeholder={placeholder}
        value={numDisabled ? undefined : value}
      />
      <Select
        items={options}
        onValueChange={(u) => {
          const newUnit = u as U;
          p.onChangeValue(convertRetentionValue(value, unit, newUnit, factors));
          p.onChangeUnit(newUnit);
        }}
        value={unit}
      >
        <SelectTrigger
          aria-label={`${p.label} unit`}
          className="w-28 shrink-0"
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
  getBrokerConfig: (name: string) => string | undefined;
};

function CreateTopicDialogContent({ form, getBrokerConfig }: FormContentProps) {
  const { control, watch, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'additionalConfig' });
  const serverless = isServerless();
  const isRedpanda = useApiStoreHook(
    (state) => state.clusterOverview?.kafka?.distribution === KafkaDistribution.REDPANDA
  );

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
              placeholder={getBrokerConfig('num.partitions')}
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
              placeholder={getBrokerConfig('default.replication.factor')}
              value={field.value}
            />
            <FieldDescription>
              {serverless ? 'Managed automatically for Serverless.' : 'Copies of each partition across brokers.'}
            </FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {!isRedpanda && (
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
                placeholder={getBrokerConfig('min.insync.replicas') ?? '1'}
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

      <Field className="sm:col-start-1">
        <FieldLabel htmlFor="create-topic-retention-time">Retention time</FieldLabel>
        <RetentionSelect
          data-testid="topic-retention-time"
          defaultConfigValue={getBrokerConfig('log.retention.ms')}
          factors={timeFactors}
          formatDefaultPlaceholder={(raw) =>
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
          valueWhenCleared={0}
        />
        <FieldDescription>How long records are kept.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="create-topic-retention-size">Retention size</FieldLabel>
        <RetentionSelect
          data-testid="topic-retention-size"
          defaultConfigValue={getBrokerConfig('log.retention.bytes')}
          factors={sizeFactors}
          formatDefaultPlaceholder={(raw) => prettyBytes(raw, { showLargeAsInfinite: true, showNullAs: 'default' })}
          id="create-topic-retention-size"
          label="Retention size"
          onChangeUnit={(u) => setValue('retentionSizeUnit', u)}
          onChangeValue={(v) => setValue('retentionSize', v)}
          unit={watch('retentionSizeUnit') as RetentionSizeUnit}
          value={watch('retentionSize')}
          valueWhenCleared={-1}
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
                  onClick={() => remove(i)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <TonedIcon icon={XIcon} tone="muted" />
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

const TRUNCATED_TOPIC_NAME_LENGTH = 40;
const BROKER_DEFAULT_COUNT = -1;

const formatCount = (count?: number) => (count === undefined || count === BROKER_DEFAULT_COUNT ? '—' : String(count));

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
        <TonedIcon className="size-6" icon={CheckCircleIcon} tone="success" />
      </div>
      <p className="text-body text-muted-foreground">Your topic is ready to use.</p>
      <div className="w-full rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-col items-center gap-0.5">
          <p className="text-body-sm font-medium tracking-wide text-muted-foreground uppercase">Topic name</p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <CopyButton className="max-w-[320px]" content={topicName ?? ''} size="sm" variant="ghost">
                    <span className="truncate font-mono">{topicName}</span>
                  </CopyButton>
                }
              />
              {(topicName?.length ?? 0) > TRUNCATED_TOPIC_NAME_LENGTH ? (
                <TooltipContent>{topicName}</TooltipContent>
              ) : null}
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
  for (const [name, value] of formConfigEntries(values)) {
    setVal(name, value);
  }

  return config.filter((x) => x.name.length > 0);
}

function formConfigEntries(values: CreateTopicFormValues) {
  return [
    [
      'retention.ms',
      values.retentionTimeUnit === 'default'
        ? undefined
        : getRetentionTimeFinalValue(values.retentionTimeMs, values.retentionTimeUnit as RetentionTimeUnit),
    ],
    [
      'retention.bytes',
      values.retentionSizeUnit === 'default'
        ? undefined
        : getRetentionSizeFinalValue(values.retentionSize, values.retentionSizeUnit as RetentionSizeUnit),
    ],
    ['min.insync.replicas', values.minInSyncReplicas],
    ['cleanup.policy', values.cleanupPolicy],
  ] satisfies [string, string | number | undefined][];
}

function tryGetBrokerConfig(configName: string) {
  return (
    api.clusterInfo?.brokers?.find(() => true)?.config.configs?.find((x) => x.name === configName)?.value ?? undefined
  );
}

function getRequestedCounts(values: CreateTopicFormValues) {
  return {
    partitionCount: values.partitions ?? Number(tryGetBrokerConfig('num.partitions') ?? BROKER_DEFAULT_COUNT),
    replicationFactor:
      values.replicationFactor ?? Number(tryGetBrokerConfig('default.replication.factor') ?? BROKER_DEFAULT_COUNT),
  };
}

type CreatedCounts = ReturnType<typeof getRequestedCounts>;

// WARNING: Older brokers return -1 for resolved counts even if explicit counts were requested; keep the requested counts.
function toCreatedTopicResult(apiResult: CreatedCounts & { topicName: string }, requested: CreatedCounts) {
  return {
    topicName: apiResult.topicName,
    partitionCount:
      apiResult.partitionCount === BROKER_DEFAULT_COUNT ? requested.partitionCount : apiResult.partitionCount,
    replicationFactor:
      apiResult.replicationFactor === BROKER_DEFAULT_COUNT ? requested.replicationFactor : apiResult.replicationFactor,
  };
}

function refreshClusterAfterCreate() {
  api.refreshClusterOverview();
  api.refreshClusterHealth().catch(() => undefined);
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
      const requested = getRequestedCounts(values);
      const apiResult = await createTopic({
        topic: {
          name: values.topicName,
          ...requested,
          configs: buildTopicConfigs(values),
        },
        validateOnly: false,
      });

      setResult(toCreatedTopicResult(apiResult, requested));
      refreshClusterAfterCreate();
    } catch (e) {
      setResult({ error: e });
    } finally {
      setIsLoading(false);
    }
  };

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
              <CreateTopicDialogContent form={form} getBrokerConfig={tryGetBrokerConfig} />
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
              <FenceGuardedButton
                action="createTopic"
                data-testid="onOk-button"
                disabled={!form.formState.isValid || isLoading}
                form="create-topic-form"
                type="submit"
              >
                {isLoading ? 'Creating…' : 'Create'}
              </FenceGuardedButton>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
