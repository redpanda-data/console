/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Link } from '@tanstack/react-router';
import { type FC, useEffect, useState } from 'react';

import '../../../utils/array-extensions';
import { create } from '@bufbuild/protobuf';
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt';
import { TrashIcon } from 'components/icons';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'components/redpanda-ui/components/alert-dialog';
import { Button, buttonVariants } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  useFieldContext,
} from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectTrigger,
  MultiSelectValue,
  renderMultiSelectOptions,
} from 'components/redpanda-ui/components/multi-select';
import { cn } from 'components/redpanda-ui/lib/utils';
import { DateTimeInput } from 'components/ui/date-time-input';
import { CircleAlertIcon, InfoIcon } from 'lucide-react';

import {
  type CreateDebugBundleRequest,
  CreateDebugBundleRequestSchema,
  DebugBundleStatus_Status,
  LabelSelectorSchema,
  type SCRAMAuth,
  SCRAMAuth_Mechanism,
} from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { appGlobal } from '../../../state/app-global';
import { api, useApiStoreHook } from '../../../state/backend-api';
import DebugBundleLink from '../../debugBundle/debug-bundle-link';
import { SingleSelect } from '../../misc/select';
import { PageComponent, type PageInitHelper } from '../page';

// Unit mappings for consistent dropdown handling
const SIZE_UNITS = [
  { value: 1, label: 'Bytes' },
  { value: 1024, label: 'KB' },
  { value: 1024 * 1024, label: 'MB' },
  { value: 1024 * 1024 * 1024, label: 'GB' },
];

const TIME_UNITS = [
  { value: 1, label: 'Seconds' },
  { value: 60, label: 'Minutes' },
];

/**
 * A labelled multi-select.
 *
 * `SimpleMultiSelect` forwards only `id`, `aria-describedby` and `aria-invalid`, and its trigger is a
 * `<div>` carrying a hardcoded `aria-label="Multi-select trigger"` — so a `<FieldLabel htmlFor>`
 * pointing at it associates nothing and the control announces as "Multi-select trigger". Composing the
 * parts lets `aria-labelledby` through, which wins over that `aria-label`. Chakra's `FormField label`
 * did associate, so this keeps parity.
 */
const LabelledMultiSelect = ({
  labelId,
  options,
  value,
  onValueChange,
  invalid,
}: {
  labelId: string;
  options: string[];
  value: string[];
  onValueChange: (next: string[]) => void;
  invalid?: boolean;
}) => {
  const { errorId } = useFieldContext();

  return (
    <MultiSelect onValueChange={onValueChange} value={value}>
      <MultiSelectTrigger
        aria-describedby={errorId}
        aria-invalid={invalid || undefined}
        aria-labelledby={labelId}
        className="w-full"
      >
        <MultiSelectValue placeholder="Select items..." />
      </MultiSelectTrigger>
      <MultiSelectContent>
        <MultiSelectSearch placeholder="Search..." />
        <MultiSelectList>{renderMultiSelectOptions(options.map((o) => ({ value: o, label: o })))}</MultiSelectList>
        <MultiSelectEmpty>No items found</MultiSelectEmpty>
      </MultiSelectContent>
    </MultiSelect>
  );
};

/**
 * A number paired with its unit — four fields on this form share the shape exactly.
 *
 * `valueAsNumber` is NaN while the field is empty, which is what the pre-migration code stored too;
 * this only keeps the input from *displaying* "NaN" while the user is retyping.
 */
const NumberWithUnitField = ({
  id,
  label,
  description,
  error,
  units,
  value,
  unit,
  onValueChange,
  onUnitChange,
}: {
  id: string;
  label: string;
  description: string;
  error?: string;
  units: { value: number; label: string }[];
  /** `cpuProfilerWaitSeconds` is optional in form state; the rest are always set. */
  value: number | undefined;
  unit: number;
  onValueChange: (next: number) => void;
  onUnitChange: (next: number) => void;
}) => (
  <Field data-invalid={Boolean(error) || undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <div className="flex gap-2">
      <Input
        id={id}
        onChange={(e) => onValueChange(e.target.valueAsNumber)}
        testId={id}
        type="number"
        value={value === undefined || Number.isNaN(value) ? '' : value}
      />
      <SingleSelect<number> className="min-w-[150px]" onChange={onUnitChange} options={units} value={unit} />
    </div>
    <FieldDescription>{description}</FieldDescription>
    <FieldError>{error}</FieldError>
  </Field>
);

/** `data-invalid={false}` would render as the string "false", so the falsy case has to be undefined. */
const invalidFlag = (violation?: string): true | undefined => (violation ? true : undefined);

const Header: FC<{ mode?: 'default' | 'advanced' }> = ({ mode = 'default' }) => (
  <div className="text-body" data-testid={`debug-bundle-description-${mode}-mode`}>
    Collect environment data that can help debug and diagnose issues with a Redpanda cluster, a broker, or the machine
    it's running on. This will bundle the collected data into a ZIP file.
  </div>
);

type ErrorDebugInfo = {
  reason?: string;
  domain?: string;
  fieldViolations?: Array<{
    field: string;
    description: string;
  }>;
};

type ErrorDetail = {
  type: string;
  value: string;
  debug?: ErrorDebugInfo;
};

// This is a tmp workaround until we figure out how to properly type response errors from the backend
type ErrorResponse = {
  code: string;
  message: string;
  details: ErrorDetail[];
};

type FieldViolationsMap = {
  [field: string]: string;
};

export class AdminDebugBundle extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.title = 'Debug bundle';
    p.addBreadcrumb('Debug bundle', '/debug-bundle');

    this.refreshData();
    appGlobal.onRefresh = () => this.refreshData();
  }

  refreshData() {
    api.refreshDebugBundleStatuses().catch(() => {
      // Error handling managed by API layer
    });
  }

  render() {
    return <AdminDebugBundleContent />;
  }
}

const AdminDebugBundleContent: FC = () => {
  const statuses = useApiStoreHook((s) => s.debugBundleStatuses);
  const hasDebugProcess = useApiStoreHook((s) => s.hasDebugProcess);
  const [submitInProgress, setSubmitInProgress] = useState(false);
  const [createBundleError, setCreateBundleError] = useState<ErrorResponse | undefined>(undefined);

  const isInProgress = statuses.some(
    (s) => s.value.case === 'bundleStatus' && s.value.value.status === DebugBundleStatus_Status.RUNNING
  );
  const isExpired =
    statuses.length > 0 &&
    !isInProgress &&
    statuses.some((s) => s.value.case === 'bundleStatus' && s.value.value.status === DebugBundleStatus_Status.EXPIRED);
  const isError =
    statuses.length > 0 &&
    !isInProgress &&
    statuses.every((s) => s.value.case === 'bundleStatus' && s.value.value.status === DebugBundleStatus_Status.ERROR);
  const canDownload =
    statuses.length > 0 &&
    !isInProgress &&
    statuses.some((s) => s.value.case === 'bundleStatus' && s.value.value.status === DebugBundleStatus_Status.SUCCESS);

  const debugBundleStatus = statuses
    .map((s) => (s.value.case === 'bundleStatus' ? s.value.value : undefined))
    .find(Boolean);

  if (isInProgress) {
    const jobId = debugBundleStatus?.jobId;
    return (
      <div>
        <Header />
        {/* debug-bundle-page.ts looks this up with getByRole('link'), so it must not become a button.
            Rendered only with a job id: `$jobId` needs a segment, and an empty one routes nowhere. */}
        {jobId ? (
          <Link
            className={cn(buttonVariants({ variant: 'link' }), 'mt-4 px-0')}
            params={{ jobId }}
            to="/debug-bundle/progress/$jobId"
          >
            Bundle generation in progress...
          </Link>
        ) : (
          <div className="mt-4">Generating bundle...</div>
        )}
        {debugBundleStatus?.createdAt ? (
          <div>Started {timestampDate(debugBundleStatus.createdAt).toLocaleString()}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="mt-4">
        {Boolean(canDownload || isExpired) && <div className="font-bold">Latest debug bundle:</div>}
        {Boolean(isExpired) && <div>Your previous bundle has expired and cannot be downloaded.</div>}
        {Boolean(isError) && <div className="font-bold">Your debug bundle was not generated. Try again.</div>}
        {Boolean(canDownload) && <DebugBundleLink showDeleteButton statuses={statuses} />}

        {statuses.length === 0 && <div>No debug bundle available for download.</div>}
      </div>

      <div>
        {Boolean(submitInProgress) && <div>Generating bundle ...</div>}

        <NewDebugBundleForm
          debugBundleExists={hasDebugProcess}
          error={createBundleError}
          isError={isError}
          isExpired={isExpired}
          onSubmit={(data: CreateDebugBundleRequest) => {
            setSubmitInProgress(true);
            setCreateBundleError(undefined);
            api
              .createDebugBundle(data)
              .then(async (result) => {
                await api.refreshDebugBundleStatuses();
                appGlobal.historyPush(`/debug-bundle/progress/${result.jobId}`);
              })
              .catch((err: ErrorResponse) => {
                setCreateBundleError(err);
              })
              .finally(() => {
                setSubmitInProgress(false);
              });
          }}
        />
      </div>
    </div>
  );
};

const NewDebugBundleForm: FC<{
  onSubmit: (data: CreateDebugBundleRequest) => void;
  error?: ErrorResponse;
  debugBundleExists: boolean;
  isExpired: boolean;
  isError: boolean;
}> = ({ onSubmit, error, debugBundleExists, isExpired, isError }) => {
  const [advancedForm, setAdvancedForm] = useState(false);

  useEffect(() => {
    api.refreshBrokers(true);
    api.refreshPartitions('all', true).catch(() => {
      // Error handling managed by API layer
    });
  }, []);

  const fieldViolationsMap = error?.details
    ?.find(({ debug }) => debug?.fieldViolations)
    ?.debug?.fieldViolations?.reduce((acc, violation) => {
      acc[violation.field] = violation.description;
      return acc;
    }, {} as FieldViolationsMap);

  const [formState, setFormState] = useState({
    scramUsername: undefined as string | undefined,
    scramPassword: undefined as string | undefined,
    scramMechanism: SCRAMAuth_Mechanism.SCRAM_SHA_256 as SCRAMAuth_Mechanism,
    skipTlsVerification: false,
    brokerIds: [] as number[],
    tlsEnabled: false,
    tlsInsecureSkipVerify: false,
    controllerLogsSizeLimitBytes: 132 as number, // Default 132MB
    controllerLogsSizeLimitUnit: 1024 * 1024, // Default to MB
    cpuProfilerWaitSeconds: 30 as number | undefined, // Default 30s
    cpuProfilerWaitUnit: 1, // Default to seconds
    logsSince: new Date().setDate(new Date().getDate() - 1) as number | undefined, // Default yesterday
    logsSizeLimitBytes: 100 as number, // Default 100MB
    logsSizeLimitUnit: 1024 * 1024, // Default to MB
    logsUntil: undefined as number | undefined,
    metricsIntervalSeconds: 10 as number, // Default 10s
    metricsIntervalUnit: 1, // Default to seconds
    metricsSamples: '2' as string, // Default 2 samples
    namespace: 'redpanda' as string, // Default "redpanda"
    partitions: [] as string[],
    labelSelectors: [] as Array<{ key: string; value: string }>,
  });

  const generateNewDebugBundle = () => {
    onSubmit(
      advancedForm
        ? create(CreateDebugBundleRequestSchema, {
            authentication:
              formState.scramUsername || formState.scramPassword
                ? {
                    case: 'scram',
                    value: {
                      username: formState.scramUsername,
                      password: formState.scramPassword,
                      mechanism: formState.scramMechanism,
                    } as SCRAMAuth,
                  }
                : undefined,
            brokerIds: formState.brokerIds,
            controllerLogsSizeLimitBytes:
              formState.controllerLogsSizeLimitBytes * formState.controllerLogsSizeLimitUnit,
            cpuProfilerWaitSeconds: formState.cpuProfilerWaitSeconds
              ? formState.cpuProfilerWaitSeconds * formState.cpuProfilerWaitUnit
              : undefined,
            logsSince: formState.logsSince ? timestampFromDate(new Date(formState.logsSince)) : undefined,
            logsSizeLimitBytes: formState.logsSizeLimitBytes * formState.logsSizeLimitUnit,
            logsUntil: formState.logsUntil ? timestampFromDate(new Date(formState.logsUntil)) : undefined,
            metricsIntervalSeconds: formState.metricsIntervalSeconds * formState.metricsIntervalUnit,
            tlsEnabled: formState.tlsEnabled,
            tlsInsecureSkipVerify: formState.tlsInsecureSkipVerify,
            namespace: formState.namespace,
            labelSelector: formState.labelSelectors.map((x) => create(LabelSelectorSchema, x)),
            partitions: formState.partitions,
          })
        : create(CreateDebugBundleRequestSchema)
    );
  };

  return (
    <div className="mt-4">
      <Header mode={advancedForm ? 'advanced' : 'default'} />
      {Boolean(advancedForm) && (
        <div className="mt-4 flex w-full flex-col gap-2 sm:w-[500px]">
          <Alert className="my-2" icon={<InfoIcon />} variant="informative">
            <AlertDescription>
              {/* One block child: AlertDescription is a grid, so loose text runs each become a row. */}
              <p>
                This is an advanced feature, best used if you have received direction to do so from Redpanda support.
              </p>
            </AlertDescription>
          </Alert>
          <Field data-invalid={invalidFlag(fieldViolationsMap?.['scram.username'])}>
            <FieldLabel htmlFor="scram-user-input">SCRAM user</FieldLabel>
            <Input
              id="scram-user-input"
              onChange={(e) => setFormState((prev) => ({ ...prev, scramUsername: e.target.value }))}
              testId="scram-user-input"
              value={formState.scramUsername ?? ''}
            />
            <FieldError>{fieldViolationsMap?.['scram.username']}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="sasl-mechanism" required>
              SASL Mechanism
            </FieldLabel>
            <SingleSelect<SCRAMAuth_Mechanism>
              id="sasl-mechanism"
              onChange={(e) => {
                setFormState((prev) => ({ ...prev, scramMechanism: e }));
              }}
              options={[
                {
                  value: SCRAMAuth_Mechanism.SCRAM_SHA_256,
                  label: 'SCRAM-SHA-256',
                },
                {
                  value: SCRAMAuth_Mechanism.SCRAM_SHA_512,
                  label: 'SCRAM-SHA-512',
                },
              ]}
              value={formState.scramMechanism}
            />
          </Field>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={formState.tlsEnabled}
              id="tls-enabled"
              onCheckedChange={(checked) => {
                setFormState((prev) => ({ ...prev, tlsEnabled: checked === true }));
              }}
            />
            <Label className="cursor-pointer" htmlFor="tls-enabled">
              TLS enabled
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={formState.skipTlsVerification}
              id="skip-tls-verification"
              onCheckedChange={(checked) => {
                setFormState((prev) => ({ ...prev, skipTlsVerification: checked === true }));
              }}
            />
            <Label className="cursor-pointer" htmlFor="skip-tls-verification">
              Skip TLS verification
            </Label>
          </div>
          <Field data-invalid={invalidFlag(fieldViolationsMap?.['scram.password'])}>
            <FieldLabel htmlFor="scram-user-password">Password</FieldLabel>
            <Input
              id="scram-user-password"
              onChange={(e) => setFormState((prev) => ({ ...prev, scramPassword: e.target.value }))}
              testId="scram-user-password"
              type="password"
              value={formState.scramPassword ?? ''}
            />
            <FieldError>{fieldViolationsMap?.['scram.password']}</FieldError>
          </Field>
          <Field>
            <FieldLabel id="broker-ids-label">Broker(s)</FieldLabel>
            <LabelledMultiSelect
              labelId="broker-ids-label"
              onValueChange={(values) => {
                setFormState((prev) => ({ ...prev, brokerIds: values.map(Number) }));
              }}
              options={api.brokers?.map((broker) => `${broker.brokerId}`) ?? []}
              value={formState.brokerIds.map(String)}
            />
            <FieldDescription>Specify broker IDs (or leave blank for all)</FieldDescription>
          </Field>
          <NumberWithUnitField
            description={`The size limit of the controller logs that can be stored in the bundle (default "132MB")`}
            error={fieldViolationsMap?.controllerLogsSizeLimitBytes}
            id="controller-log-size-input"
            label="Controller log size limit"
            onUnitChange={(next) => setFormState((prev) => ({ ...prev, controllerLogsSizeLimitUnit: next }))}
            onValueChange={(next) => setFormState((prev) => ({ ...prev, controllerLogsSizeLimitBytes: next }))}
            unit={formState.controllerLogsSizeLimitUnit}
            units={SIZE_UNITS}
            value={formState.controllerLogsSizeLimitBytes}
          />
          <NumberWithUnitField
            description={'How long to collect samples for the CPU profiler. Must be higher than 15s (default 30s)'}
            error={fieldViolationsMap?.cpuProfilerWaitSeconds}
            id="cpu-profiler-input"
            label="CPU profiler wait"
            onUnitChange={(next) => setFormState((prev) => ({ ...prev, cpuProfilerWaitUnit: next }))}
            onValueChange={(next) => setFormState((prev) => ({ ...prev, cpuProfilerWaitSeconds: next }))}
            unit={formState.cpuProfilerWaitUnit}
            units={TIME_UNITS}
            value={formState.cpuProfilerWaitSeconds}
          />
          <Field data-invalid={invalidFlag(fieldViolationsMap?.logsSince)}>
            <FieldLabel>Logs since</FieldLabel>
            <DateTimeInput
              onChange={(date) => setFormState((prev) => ({ ...prev, logsSince: date }))}
              value={formState.logsSince}
            />
            <FieldDescription>
              Include logs dated from specified date onward; (journalctl date format: YYYY-MM-DD, 'yesterday', or
              'today'). Default 'yesterday'.
            </FieldDescription>
            <FieldError>{fieldViolationsMap?.logsSince}</FieldError>
          </Field>
          <Field data-invalid={invalidFlag(fieldViolationsMap?.logsUntil)}>
            <FieldLabel>Logs until</FieldLabel>
            <DateTimeInput
              onChange={(date) => setFormState((prev) => ({ ...prev, logsUntil: date }))}
              value={formState.logsUntil}
            />
            <FieldDescription>
              Include logs older than the specified date; (journalctl date format: YYYY-MM-DD, 'yesterday', or 'today').
            </FieldDescription>
            <FieldError>{fieldViolationsMap?.logsUntil}</FieldError>
          </Field>
          <NumberWithUnitField
            description={'Read the logs until the given size is reached (for example, 3MB, 1GB). Default 100MB.'}
            error={fieldViolationsMap?.logsSizeLimitBytes}
            id="log-size-limit-input"
            label="Logs size limit"
            onUnitChange={(next) => setFormState((prev) => ({ ...prev, logsSizeLimitUnit: next }))}
            onValueChange={(next) => setFormState((prev) => ({ ...prev, logsSizeLimitBytes: next }))}
            unit={formState.logsSizeLimitUnit}
            units={SIZE_UNITS}
            value={formState.logsSizeLimitBytes}
          />
          <NumberWithUnitField
            description={'Interval between metrics snapshots (default 10s)'}
            error={fieldViolationsMap?.metricsIntervalSeconds}
            id="metrics-interval-duration-input"
            label="Metrics interval duration"
            onUnitChange={(next) => setFormState((prev) => ({ ...prev, metricsIntervalUnit: next }))}
            onValueChange={(next) => setFormState((prev) => ({ ...prev, metricsIntervalSeconds: next }))}
            unit={formState.metricsIntervalUnit}
            units={TIME_UNITS}
            value={formState.metricsIntervalSeconds}
          />
          <Field data-invalid={invalidFlag(fieldViolationsMap?.metricsSamples)}>
            <FieldLabel htmlFor="metrics-samples-input">Metrics samples</FieldLabel>
            <Input
              id="metrics-samples-input"
              onChange={(e) => setFormState((prev) => ({ ...prev, metricsSamples: e.target.value }))}
              testId="metrics-samples-input"
              value={formState.metricsSamples}
            />
            <FieldDescription>
              Number of metrics samples to take (at the interval of 'metrics interval duration'). Must be &gt;= 2
            </FieldDescription>
            <FieldError>{fieldViolationsMap?.metricsSamples}</FieldError>
          </Field>
          <Field data-invalid={invalidFlag(fieldViolationsMap?.namespace)}>
            <FieldLabel htmlFor="namespace-input">Namespace</FieldLabel>
            <Input
              id="namespace-input"
              onChange={(e) => setFormState((prev) => ({ ...prev, namespace: e.target.value }))}
              testId="namespace-input"
              value={formState.namespace}
            />
            <FieldDescription>
              The namespace to use to collect the resources from (k8s only). Default "redpanda".
            </FieldDescription>
            <FieldError>{fieldViolationsMap?.namespace}</FieldError>
          </Field>
          <Field data-invalid={invalidFlag(fieldViolationsMap?.partitions)}>
            <FieldLabel id="partitions-label">Partition(s)</FieldLabel>
            <LabelledMultiSelect
              invalid={Boolean(fieldViolationsMap?.partitions)}
              labelId="partitions-label"
              onValueChange={(values) => setFormState((prev) => ({ ...prev, partitions: values }))}
              options={api.getTopicPartitionArray}
              value={formState.partitions}
            />
            <FieldDescription>
              Partition ID. If set, the bundle will include extra information about the requested partitions.
            </FieldDescription>
            <FieldError>{fieldViolationsMap?.partitions}</FieldError>
          </Field>
          <Field data-invalid={invalidFlag(fieldViolationsMap?.labelSelectors)}>
            <FieldLabel>Label selectors</FieldLabel>
            {formState.labelSelectors.map((labelSelector, idx) => (
              <div
                className="grid grid-cols-[1fr_1fr_auto] gap-2"
                key={`label-${labelSelector.key}-${labelSelector.value}`}
              >
                <div>
                  <div className="text-body-sm">Key</div>
                  <Input
                    aria-label={`Label selector ${idx + 1} key`}
                    onChange={(e) => {
                      setFormState((prev) => ({
                        ...prev,
                        labelSelectors: prev.labelSelectors.map((ls, i) =>
                          i === idx ? { ...ls, key: e.target.value } : ls
                        ),
                      }));
                    }}
                    value={labelSelector.key}
                  />
                </div>
                <div>
                  <div className="text-body-sm">Value</div>
                  <Input
                    aria-label={`Label selector ${idx + 1} value`}
                    onChange={(e) => {
                      setFormState((prev) => ({
                        ...prev,
                        labelSelectors: prev.labelSelectors.map((ls, i) =>
                          i === idx ? { ...ls, value: e.target.value } : ls
                        ),
                      }));
                    }}
                    value={labelSelector.value}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    aria-label={`Remove label selector ${idx + 1}`}
                    onClick={() => {
                      setFormState((prev) => ({
                        ...prev,
                        labelSelectors: prev.labelSelectors.filter((_, i) => i !== idx),
                      }));
                    }}
                    variant="ghost"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </div>
            ))}
            <div>
              <Button
                className="my-2"
                onClick={() => {
                  setFormState((prev) => ({
                    ...prev,
                    labelSelectors: [...prev.labelSelectors, { key: '', value: '' }],
                  }));
                }}
                variant="outline"
              >
                Add
              </Button>
            </div>
            <FieldDescription>Label selectors to filter your resources.</FieldDescription>
            <FieldError>{fieldViolationsMap?.labelSelectors}</FieldError>
          </Field>
        </div>
      )}

      {error ? (
        <Alert className="my-4" icon={<CircleAlertIcon />} variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-4 flex gap-2">
        {debugBundleExists && !isExpired && !isError ? (
          <AlertDialog>
            <AlertDialogTrigger render={<Button>{advancedForm ? 'Generate' : 'Generate default'}</Button>} />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Generate new debug bundle</AlertDialogTitle>
                <AlertDialogDescription>
                  You have an existing debug bundle; generating a new one will delete the previous one. Are you sure?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel render={<Button variant="ghost">Cancel</Button>} />
                <AlertDialogAction
                  onClick={() => {
                    generateNewDebugBundle();
                  }}
                  render={<Button>Confirm</Button>}
                />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button
            onClick={() => {
              generateNewDebugBundle();
            }}
          >
            {advancedForm ? 'Generate' : 'Generate default'}
          </Button>
        )}
        {advancedForm ? (
          <div className="flex items-center gap-1">
            or
            <Button
              className="px-0"
              data-testid="switch-to-default-debug-bundle-form"
              onClick={() => {
                setAdvancedForm(false);
              }}
              variant="link"
            >
              back to default
            </Button>
          </div>
        ) : (
          <Button
            data-testid="switch-to-custom-debug-bundle-form"
            onClick={() => {
              setAdvancedForm(true);
            }}
            variant="link"
          >
            or create a custom debug bundle
          </Button>
        )}
      </div>
    </div>
  );
};
