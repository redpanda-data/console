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

import { observer, useLocalObservable } from 'mobx-react';
import { type FC, useEffect, useState } from 'react';

import { api } from '../../../state/backend-api';
import '../../../utils/array-extensions';
import { create } from '@bufbuild/protobuf';
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Checkbox,
  ConfirmModal,
  DateTimeInput,
  Flex,
  FormField,
  Grid,
  GridItem,
  Input,
  isMultiValue,
  isSingleValue,
  PasswordInput,
  Select,
  Text,
} from '@redpanda-data/ui';
import { TrashIcon } from 'components/icons';
import { makeObservable, observable } from 'mobx';
import { Link as ReactRouterLink } from 'react-router-dom';

import {
  type CreateDebugBundleRequest,
  CreateDebugBundleRequestSchema,
  LabelSelectorSchema,
  type SCRAMAuth,
  SCRAMAuth_Mechanism,
} from '../../../protogen/redpanda/api/console/v1alpha1/debug_bundle_pb';
import { appGlobal } from '../../../state/app-global';
import type { BrokerWithConfigAndStorage } from '../../../state/rest-interfaces';
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

// Helper functions to get labels from unit values
const getSizeUnitLabel = (unitValue: number): string =>
  SIZE_UNITS.find((unit) => unit.value === unitValue)?.label || '';

const getTimeUnitLabel = (unitValue: number): string =>
  TIME_UNITS.find((unit) => unit.value === unitValue)?.label || '';

const Header: FC<{ mode?: 'default' | 'advanced' }> = ({ mode = 'default' }) => (
  <Text data-testid={`debug-bundle-description-${mode}-mode`}>
    Collect environment data that can help debug and diagnose issues with a Redpanda cluster, a broker, or the machine
    it's running on. This will bundle the collected data into a ZIP file.
  </Text>
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

@observer
export class AdminDebugBundle extends PageComponent {
  @observable quickSearch = '';
  @observable submitInProgress = false;
  @observable confirmModalIsOpen = false;
  @observable createBundleError: ErrorResponse | undefined = undefined;
  @observable jobId: string | undefined = undefined;

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

  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
    makeObservable(this);
  }

  render() {
    if (api.isDebugBundleInProgress) {
      return (
        <Box>
          <Header />
          <Button
            as={ReactRouterLink}
            mt={4}
            px={0}
            to={`/debug-bundle/progress/${api.debugBundleStatus?.jobId}`}
            variant="link"
          >
            Bundle generation in progress...
          </Button>
          {api.debugBundleStatus?.createdAt ? (
            <Text>Started {timestampDate(api.debugBundleStatus.createdAt).toLocaleString()}</Text>
          ) : null}
        </Box>
      );
    }

    return (
      <Box>
        <Box mt={4}>
          {Boolean(api.canDownloadDebugBundle || api.isDebugBundleExpired) && (
            <Text fontWeight="bold">Latest debug bundle:</Text>
          )}
          {Boolean(api.isDebugBundleExpired) && <Text>Your previous bundle has expired and cannot be downloaded.</Text>}
          {Boolean(api.isDebugBundleError) && (
            <Text fontWeight="bold">Your debug bundle was not generated. Try again.</Text>
          )}
          {Boolean(api.canDownloadDebugBundle) && (
            <DebugBundleLink showDeleteButton statuses={api.debugBundleStatuses} />
          )}

          {api.debugBundleStatuses.length === 0 && <Text>No debug bundle available for download.</Text>}
        </Box>

        <Box>
          {Boolean(this.submitInProgress) && <Box>Generating bundle ...</Box>}

          <NewDebugBundleForm
            debugBundleExists={api.hasDebugProcess}
            error={this.createBundleError}
            onSubmit={(data: CreateDebugBundleRequest) => {
              this.submitInProgress = true;
              this.createBundleError = undefined;
              api
                .createDebugBundle(data)
                .then(async (result) => {
                  await api.refreshDebugBundleStatuses();
                  appGlobal.historyPush(`/debug-bundle/progress/${result.jobId}`);
                })
                .catch((err: ErrorResponse) => {
                  this.createBundleError = err;
                })
                .finally(() => {
                  this.submitInProgress = false;
                });
            }}
          />
        </Box>
      </Box>
    );
  }
}

const NewDebugBundleForm: FC<{
  onSubmit: (data: CreateDebugBundleRequest) => void;
  error?: ErrorResponse;
  debugBundleExists: boolean;
}> = observer(({ onSubmit, error, debugBundleExists }) => {
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

  const formState = useLocalObservable(() => ({
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

    // Setters
    setUsername(username: string) {
      this.scramUsername = username;
    },
    setPassword(password: string) {
      this.scramPassword = password;
    },
    setBrokerIds(ids: number[]) {
      this.brokerIds = ids;
    },
    setControllerLogsSizeLimitBytes(size: number) {
      this.controllerLogsSizeLimitBytes = size;
    },
    setControllerLogsSizeLimitUnit(unit: number) {
      this.controllerLogsSizeLimitUnit = unit;
    },
    setCpuProfilerWaitSeconds(seconds: number) {
      this.cpuProfilerWaitSeconds = seconds;
    },
    setCpuProfilerWaitUnit(unit: number) {
      this.cpuProfilerWaitUnit = unit;
    },
    setLogsSince(date: number) {
      this.logsSince = date;
    },
    setLogsSizeLimitBytes(size: number) {
      this.logsSizeLimitBytes = size;
    },
    setLogsSizeLimitUnit(unit: number) {
      this.logsSizeLimitUnit = unit;
    },
    setLogsUntil(date: number) {
      this.logsUntil = date;
    },
    setMetricsIntervalSeconds(seconds: number) {
      this.metricsIntervalSeconds = seconds;
    },
    setMetricsIntervalUnit(unit: number) {
      this.metricsIntervalUnit = unit;
    },
    setMetricsSamples(samples: string) {
      this.metricsSamples = samples;
    },
    setNamespace(namespace: string) {
      this.namespace = namespace;
    },
    setPartitions(partitions: string[]) {
      this.partitions = partitions;
    },
    addLabelSelector() {
      this.labelSelectors.push({
        key: '',
        value: '',
      });
    },
    removeLabelSelector(idx: number) {
      this.labelSelectors.splice(idx, 1);
    },
    setLabelSelectorKey(value: string, idx: number) {
      this.labelSelectors[idx].key = value;
    },
    setLabelSelectorValue(value: string, idx: number) {
      this.labelSelectors[idx].value = value;
    },
  }));

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
    <Box mt={4}>
      <Header mode={advancedForm ? 'advanced' : 'default'} />
      {Boolean(advancedForm) && (
        <Flex
          flexDirection="column"
          gap={2}
          mt={4}
          width={{
            base: 'full',
            sm: 500,
          }}
        >
          <Alert my={2} status="info">
            <AlertIcon />
            This is an advanced feature, best used if you have received direction to do so from Redpanda support.
          </Alert>
          <FormField
            errorText={fieldViolationsMap?.['scram.username']}
            isInvalid={!!fieldViolationsMap?.['scram.username']}
            label="SCRAM user"
          >
            <Input
              data-testid="scram-user-input"
              onChange={(e) => formState.setUsername(e.target.value)}
              value={formState.scramUsername}
            />
          </FormField>
          <FormField label="SASL Mechanism" showRequiredIndicator>
            <SingleSelect<SCRAMAuth_Mechanism>
              onChange={(e) => {
                formState.scramMechanism = e;
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
          </FormField>
          <Checkbox
            isChecked={formState.tlsEnabled}
            onChange={(x) => {
              formState.tlsEnabled = x.target.checked;
            }}
          >
            TLS enabled
          </Checkbox>
          <Checkbox
            isChecked={formState.skipTlsVerification}
            onChange={(x) => {
              formState.skipTlsVerification = x.target.checked;
            }}
          >
            Skip TLS verification
          </Checkbox>
          <FormField
            errorText={fieldViolationsMap?.['scram.password']}
            isInvalid={!!fieldViolationsMap?.['scram.password']}
            label="Password"
          >
            <PasswordInput
              data-testid="scram-user-password"
              onChange={(e) => formState.setPassword(e.target.value)}
              value={formState.scramPassword}
            />
          </FormField>
          <FormField description="Specify broker IDs (or leave blank for all)" label="Broker(s)">
            <Select<BrokerWithConfigAndStorage['brokerId']>
              isMulti
              onChange={(x) => {
                if (isMultiValue(x)) {
                  formState.setBrokerIds(x.map((item) => item.value));
                }
              }}
              options={
                api.brokers?.map((broker) => ({
                  value: broker.brokerId,
                  label: `${broker.brokerId}`,
                })) ?? []
              }
            />
          </FormField>
          <FormField
            description='The size limit of the controller logs that can be stored in the bundle (default "132MB")'
            errorText={fieldViolationsMap?.controllerLogsSizeLimitBytes}
            isInvalid={!!fieldViolationsMap?.controllerLogsSizeLimitBytes}
            label="Controller log size limit"
          >
            <Flex gap={2}>
              <Input
                data-testid="controller-log-size-input"
                onChange={(e) => formState.setControllerLogsSizeLimitBytes(e.target.valueAsNumber)}
                type="number"
                value={formState.controllerLogsSizeLimitBytes}
              />
              <Select
                chakraStyles={{
                  container: (provided) => ({
                    ...provided,
                    minWidth: 150,
                  }),
                }}
                onChange={(value) => {
                  if (value && isSingleValue(value)) {
                    formState.setControllerLogsSizeLimitUnit(value.value);
                  }
                }}
                options={SIZE_UNITS}
                value={{
                  value: formState.controllerLogsSizeLimitUnit,
                  label: getSizeUnitLabel(formState.controllerLogsSizeLimitUnit),
                }}
              />
            </Flex>
          </FormField>
          <FormField
            description="How long to collect samples for the CPU profiler. Must be higher than 15s (default 30s)"
            errorText={fieldViolationsMap?.cpuProfilerWaitSeconds}
            isInvalid={!!fieldViolationsMap?.cpuProfilerWaitSeconds}
            label="CPU profiler wait"
          >
            <Flex gap={2}>
              <Input
                data-testid="cpu-profiler-input"
                onChange={(e) => formState.setCpuProfilerWaitSeconds(e.target.valueAsNumber)}
                type="number"
                value={formState.cpuProfilerWaitSeconds}
              />
              <Select
                chakraStyles={{
                  container: (provided) => ({
                    ...provided,
                    minWidth: 150,
                  }),
                }}
                onChange={(value) => {
                  if (value && isSingleValue(value)) {
                    formState.setCpuProfilerWaitUnit(value.value);
                  }
                }}
                options={TIME_UNITS}
                value={{
                  value: formState.cpuProfilerWaitUnit,
                  label: getTimeUnitLabel(formState.cpuProfilerWaitUnit),
                }}
              />
            </Flex>
          </FormField>
          <FormField
            description="Include logs dated from specified date onward; (journalctl date format: YYYY-MM-DD, 'yesterday', or 'today'). Default 'yesterday'."
            errorText={fieldViolationsMap?.logsSince}
            isInvalid={!!fieldViolationsMap?.logsSince}
            label="Logs since"
          >
            <DateTimeInput onChange={formState.setLogsSince} value={formState.logsSince} />
          </FormField>
          <FormField
            description="Include logs older than the specified date; (journalctl date format: YYYY-MM-DD, 'yesterday', or 'today')."
            errorText={fieldViolationsMap?.logsUntil}
            isInvalid={!!fieldViolationsMap?.logsUntil}
            label="Logs until"
          >
            <DateTimeInput onChange={formState.setLogsUntil} value={formState.logsUntil} />
          </FormField>
          <FormField
            description="Read the logs until the given size is reached (e.g. 3MB, 1GB). Default 100MB."
            errorText={fieldViolationsMap?.logsSizeLimitBytes}
            isInvalid={!!fieldViolationsMap?.logsSizeLimitBytes}
            label="Logs size limit"
          >
            <Flex gap={2}>
              <Input
                data-testid="log-size-limit-input"
                onChange={(e) => formState.setLogsSizeLimitBytes(e.target.valueAsNumber)}
                type="number"
                value={formState.logsSizeLimitBytes}
              />
              <Select
                chakraStyles={{
                  container: (provided) => ({
                    ...provided,
                    minWidth: 150,
                  }),
                }}
                onChange={(value) => {
                  if (value && isSingleValue(value)) {
                    formState.setLogsSizeLimitUnit(value.value);
                  }
                }}
                options={SIZE_UNITS}
                value={{
                  value: formState.logsSizeLimitUnit,
                  label: getSizeUnitLabel(formState.logsSizeLimitUnit),
                }}
              />
            </Flex>
          </FormField>
          <FormField
            description="Interval between metrics snapshots (default 10s)"
            errorText={fieldViolationsMap?.metricsIntervalSeconds}
            isInvalid={!!fieldViolationsMap?.metricsIntervalSeconds}
            label="Metrics interval duration"
          >
            <Flex gap={2}>
              <Input
                data-testid="metrics-interval-duration-input"
                onChange={(e) => formState.setMetricsIntervalSeconds(e.target.valueAsNumber)}
                type="number"
                value={formState.metricsIntervalSeconds}
              />
              <Select
                chakraStyles={{
                  container: (provided) => ({
                    ...provided,
                    minWidth: 150,
                  }),
                }}
                onChange={(value) => {
                  if (value && isSingleValue(value)) {
                    formState.setMetricsIntervalUnit(value.value);
                  }
                }}
                options={TIME_UNITS}
                value={{
                  value: formState.metricsIntervalUnit,
                  label: getTimeUnitLabel(formState.metricsIntervalUnit),
                }}
              />
            </Flex>
          </FormField>
          <FormField
            description="Number of metrics samples to take (at the interval of 'metrics interval duration'). Must be >= 2"
            errorText={fieldViolationsMap?.metricsSamples}
            isInvalid={!!fieldViolationsMap?.metricsSamples}
            label="Metrics samples"
          >
            <Input
              data-testid="metrics-samples-in put"
              onChange={(e) => formState.setMetricsSamples(e.target.value)}
              value={formState.metricsSamples}
            />
          </FormField>
          <FormField
            description='The namespace to use to collect the resources from (k8s only). Default "redpanda".'
            errorText={fieldViolationsMap?.namespace}
            isInvalid={!!fieldViolationsMap?.namespace}
            label="Namespace"
          >
            <Input
              data-testid="namespace-input"
              onChange={(e) => formState.setNamespace(e.target.value)}
              value={formState.namespace}
            />
          </FormField>
          <FormField
            description="Partition ID. If set, the bundle will include extra information about the requested partitions."
            errorText={fieldViolationsMap?.partitions}
            isInvalid={!!fieldViolationsMap?.partitions}
            label="Partition(s)"
          >
            <Select<string>
              isMulti
              onChange={(x) => {
                if (isMultiValue(x)) {
                  formState.setPartitions(x.map((item) => item.value));
                }
              }}
              options={api.getTopicPartitionArray.map((partition) => ({
                value: partition,
                label: partition,
              }))}
            />
          </FormField>
          <FormField
            description="Label selectors to filter your resources."
            errorText={fieldViolationsMap?.labelSelectors}
            isInvalid={!!fieldViolationsMap?.labelSelectors}
            label="Label selectors"
          >
            {formState.labelSelectors.map((labelSelector, idx) => (
              <Grid gap={2} key={`${labelSelector.key}-${labelSelector.value}-${idx}`} templateColumns="1fr 1fr auto">
                <GridItem>
                  <Text fontSize="sm">Key</Text>
                  <Input
                    onChange={(e) => {
                      formState.setLabelSelectorKey(e.target.value, idx);
                    }}
                    value={labelSelector.key}
                  />
                </GridItem>
                <GridItem>
                  <Text fontSize="sm">Value</Text>
                  <Input
                    onChange={(e) => {
                      formState.setLabelSelectorValue(e.target.value, idx);
                    }}
                    value={labelSelector.value}
                  />
                </GridItem>
                <GridItem alignItems="flex-end" display="flex">
                  <Button
                    onClick={() => {
                      formState.removeLabelSelector(idx);
                    }}
                    variant="ghost"
                  >
                    <TrashIcon />
                  </Button>
                </GridItem>
              </Grid>
            ))}
            <Box>
              <Button
                my={2}
                onClick={() => {
                  formState.addLabelSelector();
                }}
                variant="outline"
              >
                Add
              </Button>
            </Box>
          </FormField>
        </Flex>
      )}

      {error ? (
        <Alert my={4} status="error">
          <AlertIcon />
          {error.message}
        </Alert>
      ) : null}

      <Flex gap={2} mt={4}>
        {debugBundleExists && !api.isDebugBundleExpired && !api.isDebugBundleError ? (
          <ConfirmModal
            heading="Generate new debug bundle"
            onConfirm={() => {
              generateNewDebugBundle();
            }}
            trigger={advancedForm ? 'Generate' : 'Generate default'}
          >
            You have an existing debug bundle; generating a new one will delete the previous one. Are you sure?
          </ConfirmModal>
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
          <Flex alignItems="center" gap={1}>
            or
            <Button
              data-testid="switch-to-default-debug-bundle-form"
              onClick={() => {
                setAdvancedForm(false);
              }}
              px={0}
              variant="link"
            >
              back to default
            </Button>
          </Flex>
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
      </Flex>
    </Box>
  );
});
