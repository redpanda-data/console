import { create } from '@bufbuild/protobuf';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  isSingleValue,
  Select,
  Stack,
  Text,
  Tooltip,
  VStack,
} from '@redpanda-data/ui';
import {
  BatchSetQuotaRequest_QuotaSettingSchema,
  BatchSetQuotaRequestSchema,
  ListQuotasRequestSchema,
  Quota_EntityType,
  Quota_ValueType,
  RequestQuotaEntitySchema,
  RequestQuotaValueSchema,
  SetQuotaRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/quota_pb';
import { memo, useMemo, useState } from 'react';
import { type Control, Controller, useForm, useWatch } from 'react-hook-form';
import { MdInfo, MdWarning } from 'react-icons/md';
import {
  formatByteRate,
  getEntityTypeLabel,
  MAX_QUOTA_PAGE_SIZE,
  parseByteRate,
  useBatchSetQuotaMutation,
  useListQuotasQuery,
  useSetQuotaMutation,
} from 'react-query/api/quota';
import { SingleSelect } from '../../../misc/Select';

export interface QuotaFormData {
  entityType: Quota_EntityType;
  entityName: string;
  producerRate?: number;
  producerRateValue?: string;
  producerRateUnit: 'B/s' | 'KB/s' | 'MB/s' | 'GB/s';
  consumerRate?: number;
  consumerRateValue?: string;
  consumerRateUnit: 'B/s' | 'KB/s' | 'MB/s' | 'GB/s';
  controllerRate?: number;
}

interface QuotaFormProps {
  initialData?: Partial<QuotaFormData>;
  onSuccess?: () => void;
  onCancel?: () => void;
  isEdit?: boolean;
}

// Helper component for form field with tooltip - moved to module scope
const FormFieldWithTooltip = memo(
  ({
    label,
    tooltip,
    children,
    isRequired = false,
  }: {
    label: string;
    tooltip: string;
    children: React.ReactNode;
    isRequired?: boolean;
  }) => (
    <FormControl>
      <FormLabel display="flex" alignItems="center" gap={2}>
        {label}
        {isRequired && (
          <Text as="span" color="red.500">
            *
          </Text>
        )}
        <Tooltip label={tooltip} placement="top">
          <Box cursor="help" color="gray.500">
            <MdInfo size={16} />
          </Box>
        </Tooltip>
      </FormLabel>
      {children}
    </FormControl>
  ),
);

// Memoized component for rate display using useWatch
const RateDisplay = memo(
  ({
    control,
    unitField,
    valueField,
    colorScheme,
  }: {
    control: Control<QuotaFormData>;
    unitField: keyof QuotaFormData;
    valueField: keyof QuotaFormData;
    colorScheme: string;
  }) => {
    const rateUnit = useWatch({ control, name: unitField });
    const rateValue = useWatch({ control, name: valueField });

    const displayValue = useMemo(() => {
      if (!rateValue || !Number.parseFloat(rateValue as string)) return null;
      return formatByteRate(parseByteRate(rateValue as string, rateUnit as any));
    }, [rateValue, rateUnit]);

    if (!displayValue) return null;

    return (
      <Badge colorScheme={colorScheme} variant="outline">
        {displayValue}
      </Badge>
    );
  },
);

// Memoized component for conflict detection using useWatch
const ConflictBanner = memo(
  ({ control, quotaList, isEdit }: { control: Control<QuotaFormData>; quotaList: any; isEdit: boolean }) => {
    const watchedEntityType = useWatch({ control, name: 'entityType' });
    const watchedEntityName = useWatch({ control, name: 'entityName' });

    const conflicts = useMemo(() => {
      if (!quotaList?.quotas || !watchedEntityType) return [];

      const conflictList = [];
      const currentEntityName = watchedEntityName?.trim() || '';

      // Check for exact duplicate
      const exactMatch = quotaList.quotas.find(
        (quota: any) =>
          quota.entity?.entityType === watchedEntityType && (quota.entity?.entityName || '') === currentEntityName,
      );

      if (exactMatch && !isEdit) {
        conflictList.push({
          type: 'duplicate',
          message: `A quota already exists for this ${getEntityTypeLabel(watchedEntityType).toLowerCase()}`,
          severity: 'error' as const,
        });
      }

      // Check for overlapping precedence conflicts
      if (watchedEntityType === Quota_EntityType.CLIENT_ID && currentEntityName) {
        // Check if there's a prefix that would match this client ID
        const matchingPrefix = quotaList.quotas.find(
          (quota: any) =>
            quota.entity?.entityType === Quota_EntityType.CLIENT_ID_PREFIX &&
            quota.entity?.entityName &&
            currentEntityName.startsWith(quota.entity.entityName),
        );

        if (matchingPrefix) {
          conflictList.push({
            type: 'precedence',
            message: `This client ID matches prefix "${matchingPrefix.entity.entityName}" - exact match will take precedence`,
            severity: 'warning' as const,
          });
        }
      }

      return conflictList;
    }, [quotaList?.quotas, watchedEntityType, watchedEntityName, isEdit]);

    if (conflicts.length === 0) return null;

    return (
      <VStack align="start" spacing={2} mt={2}>
        {conflicts.map((conflict, index) => (
          <Alert key={index} status={conflict.severity} variant="subtle" size="sm">
            <AlertIcon />
            <HStack>
              {conflict.severity === 'error' ? <MdWarning /> : <MdInfo />}
              <Text fontSize="sm">{conflict.message}</Text>
            </HStack>
          </Alert>
        ))}
      </VStack>
    );
  },
);

// Memoized component for precedence badges using useWatch
const PrecedenceBadge = memo(({ control }: { control: Control<QuotaFormData> }) => {
  const watchedEntityType = useWatch({ control, name: 'entityType' });
  const watchedEntityName = useWatch({ control, name: 'entityName' });

  return (
    <Box mt={2}>
      {watchedEntityType === Quota_EntityType.CLIENT_ID && !watchedEntityName && (
        <HStack>
          <Badge colorScheme="blue" variant="outline">
            Default
          </Badge>
          <Text fontSize="sm" color="gray.600">
            Lowest precedence - applies when no exact or prefix match exists
          </Text>
        </HStack>
      )}
      {watchedEntityType === Quota_EntityType.CLIENT_ID && watchedEntityName && (
        <HStack>
          <Badge colorScheme="red" variant="outline">
            Exact Match
          </Badge>
          <Text fontSize="sm" color="gray.600">
            Highest precedence - overrides all other quotas for this client
          </Text>
        </HStack>
      )}
      {watchedEntityType === Quota_EntityType.CLIENT_ID_PREFIX && (
        <HStack>
          <Badge colorScheme="orange" variant="outline">
            Prefix Match
          </Badge>
          <Text fontSize="sm" color="gray.600">
            Medium precedence - overrides default quotas but not exact matches
          </Text>
        </HStack>
      )}
    </Box>
  );
});

// Custom hook for form validation using useWatch
const useFormValidation = (control: Control<QuotaFormData>, quotaList: any, isEdit: boolean) => {
  const watchedEntityType = useWatch({ control, name: 'entityType' });
  const watchedEntityName = useWatch({ control, name: 'entityName' });
  const watchedProducerRateValue = useWatch({ control, name: 'producerRateValue' });
  const watchedConsumerRateValue = useWatch({ control, name: 'consumerRateValue' });
  const watchedControllerRate = useWatch({ control, name: 'controllerRate' });

  const hasErrors = useMemo(() => {
    if (!quotaList?.quotas || !watchedEntityType) return false;

    const currentEntityName = watchedEntityName?.trim() || '';

    // Check for exact duplicate
    const exactMatch = quotaList.quotas.find(
      (quota: any) =>
        quota.entity?.entityType === watchedEntityType && (quota.entity?.entityName || '') === currentEntityName,
    );

    return exactMatch && !isEdit;
  }, [quotaList?.quotas, watchedEntityType, watchedEntityName, isEdit]);

  const hasValues = !!(watchedProducerRateValue || watchedConsumerRateValue || watchedControllerRate);

  return { hasErrors, hasValues };
};

export const QuotaForm = ({ initialData, onSuccess, onCancel, isEdit = false }: QuotaFormProps) => {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const setQuotaMutation = useSetQuotaMutation();
  const batchSetQuotaMutation = useBatchSetQuotaMutation();

  // Fetch existing quotas for conflict detection
  const { data: quotaList } = useListQuotasQuery(
    create(ListQuotasRequestSchema, {
      pageSize: MAX_QUOTA_PAGE_SIZE,
    }),
  );

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<QuotaFormData>({
    defaultValues: {
      entityType: Quota_EntityType.CLIENT_ID,
      entityName: '',
      producerRateValue: '',
      producerRateUnit: 'MB/s',
      consumerRateValue: '',
      consumerRateUnit: 'MB/s',
      controllerRate: undefined,
      ...initialData,
    },
  });

  // Use useWatch selectively only for fields that don't cause re-renders
  const watchedEntityType = useWatch({ control, name: 'entityType' });
  const watchedEntityName = useWatch({ control, name: 'entityName' });
  const watchedControllerRate = useWatch({ control, name: 'controllerRate' });

  // Use validation hook for form state
  const { hasErrors, hasValues } = useFormValidation(control, quotaList, isEdit);

  const onSubmit = async (data: QuotaFormData) => {
    try {
      const values = [];

      // Add producer rate if specified
      if (data.producerRateValue && Number.parseFloat(data.producerRateValue) > 0) {
        values.push({
          valueType: Quota_ValueType.PRODUCER_BYTE_RATE,
          value: parseByteRate(data.producerRateValue, data.producerRateUnit),
        });
      }

      // Add consumer rate if specified
      if (data.consumerRateValue && Number.parseFloat(data.consumerRateValue) > 0) {
        values.push({
          valueType: Quota_ValueType.CONSUMER_BYTE_RATE,
          value: parseByteRate(data.consumerRateValue, data.consumerRateUnit),
        });
      }

      // Add controller rate if specified
      if (data.controllerRate && data.controllerRate > 0) {
        values.push({
          valueType: Quota_ValueType.CONTROLLER_MUTATION_RATE,
          value: data.controllerRate,
        });
      }

      if (values.length === 0) {
        throw new Error('At least one quota value must be specified');
      }


      let response: any;
      if (values.length === 1) {
        // Single value: use SetQuota API
        const entity = create(RequestQuotaEntitySchema, {
          entityType: data.entityType,
          entityName: data.entityName || '', // Empty string for default entity
        });

        const value = create(RequestQuotaValueSchema, {
          valueType: values[0].valueType,
          value: values[0].value,
        });

        const request = create(SetQuotaRequestSchema, {
          entity,
          value,
        });

        response = await setQuotaMutation.mutateAsync(request);
      } else {
        // Multiple values: use BatchSetQuota API
        const entity = create(RequestQuotaEntitySchema, {
          entityType: data.entityType,
          entityName: data.entityName || '', // Empty string for default entity
        });

        const quotaValues = values.map((v) =>
          create(RequestQuotaValueSchema, {
            valueType: v.valueType,
            value: v.value,
          }),
        );

        const quotaSetting = create(BatchSetQuotaRequest_QuotaSettingSchema, {
          entity,
          values: quotaValues,
        });

        const request = create(BatchSetQuotaRequestSchema, {
          settings: [quotaSetting],
        });

        response = await batchSetQuotaMutation.mutateAsync(request);
      }

      onSuccess?.();
    } catch (error) {
      console.error('Failed to save quota:', error);
    }
  };

  const getEntityNamePlaceholder = () => {
    switch (watchedEntityType) {
      case Quota_EntityType.CLIENT_ID:
        return 'e.g., my-client-id (leave empty for default)';
      case Quota_EntityType.CLIENT_ID_PREFIX:
        return 'e.g., service-prefix- (required for prefix type)';
      default:
        return 'Entity name';
    }
  };

  const shouldRequireEntityName = watchedEntityType === Quota_EntityType.CLIENT_ID_PREFIX;

  // Remove duplicate FormFieldWithTooltip - now at module scope

  const getEffectiveQuotaPreview = () => {
    if (!isPreviewMode) return null;

    const entityDesc = watchedEntityName
      ? `${getEntityTypeLabel(watchedEntityType)}: ${watchedEntityName}`
      : `Default ${getEntityTypeLabel(watchedEntityType)}`;

    return (
      <Alert status="info" variant="subtle">
        <AlertIcon />
        <VStack align="start" spacing={1}>
          <Text fontWeight="semibold">Preview for {entityDesc}</Text>
          <Text fontSize="sm">
            This quota will apply to:{' '}
            {watchedEntityType === Quota_EntityType.CLIENT_ID_PREFIX
              ? `clients matching "${watchedEntityName}*"`
              : watchedEntityName
                ? `the specific client "${watchedEntityName}"`
                : 'all clients (default quota)'}
          </Text>
        </VStack>
      </Alert>
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Stack spacing={6}>
        {/* Entity Configuration */}
        <VStack align="start" spacing={4}>
          <Text fontSize="lg" fontWeight="semibold">
            Entity Configuration
          </Text>

          <FormFieldWithTooltip
            label="Entity Type"
            tooltip="Choose the type of quota: Client ID for specific clients, Client ID Prefix for pattern matching, or leave entity name empty for default quota"
          >
            <Controller
              name="entityType"
              control={control}
              rules={{ required: 'Entity type is required' }}
              render={({ field }) => (
                <SingleSelect<Quota_EntityType>
                  options={[
                    { value: Quota_EntityType.CLIENT_ID, label: 'Client ID' },
                    { value: Quota_EntityType.CLIENT_ID_PREFIX, label: 'Client ID Prefix' },
                  ]}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            {errors.entityType && <FormErrorMessage>{errors.entityType?.message}</FormErrorMessage>}
          </FormFieldWithTooltip>

          <FormFieldWithTooltip
            label="Entity Name"
            tooltip={
              watchedEntityType === Quota_EntityType.CLIENT_ID
                ? 'Specify a client ID for exact matching, or leave empty to create a default quota that applies to all clients without more specific quotas'
                : "Specify the prefix that client IDs must start with (e.g., 'service-' matches 'service-1', 'service-2', etc.)"
            }
            isRequired={shouldRequireEntityName}
          >
            <Input
              {...register('entityName', {
                required: shouldRequireEntityName ? 'Entity name is required for prefix type' : false,
              })}
              placeholder={getEntityNamePlaceholder()}
            />
            {errors.entityName && <FormErrorMessage>{errors.entityName?.message}</FormErrorMessage>}

            {/* Show precedence information using memoized component */}
            <PrecedenceBadge control={control} />

            {/* Show conflicts using memoized component */}
            <ConflictBanner control={control} quotaList={quotaList} isEdit={isEdit} />
          </FormFieldWithTooltip>
        </VStack>

        {/* Quota Values */}
        <VStack align="start" spacing={4}>
          <HStack>
            <Text fontSize="lg" fontWeight="semibold">
              Quota Values
            </Text>
            <Tooltip label="At least one quota value must be specified. Each quota type is evaluated independently.">
              <Box cursor="help" color="gray.500">
                <MdInfo size={16} />
              </Box>
            </Tooltip>
          </HStack>

          {/* Producer Rate */}
          <FormFieldWithTooltip
            label="Producer Rate (optional)"
            tooltip="Maximum data rate for producer requests. Enter a number and select the unit (B/s, KB/s, MB/s, or GB/s). For example: 100 MB/s means producers can send up to 100 megabytes per second. Leave empty for no limit."
          >
            <HStack>
              <Input {...register('producerRateValue')} placeholder="e.g., 100" type="number" step="0.01" min="0" />
              <Box minWidth="120px">
                <Controller
                  name="producerRateUnit"
                  control={control}
                  render={({ field }) => (
                    <Select<'B/s' | 'KB/s' | 'MB/s' | 'GB/s'>
                      value={{ value: field.value }}
                      onChange={(option) => {
                        if (isSingleValue(option) && option?.value) {
                          field.onChange(option.value);
                        }
                      }}
                      options={[
                        { value: 'B/s', label: 'B/s' },
                        { value: 'KB/s', label: 'KB/s' },
                        { value: 'MB/s', label: 'MB/s' },
                        { value: 'GB/s', label: 'GB/s' },
                      ]}
                    />
                  )}
                />
              </Box>
            </HStack>
            <HStack mt={1} spacing={2}>
              <Text fontSize="sm" color="gray.500">
                Maximum throughput for producer requests
              </Text>
              <RateDisplay
                control={control}
                unitField="producerRateUnit"
                valueField="producerRateValue"
                colorScheme="green"
              />
            </HStack>
          </FormFieldWithTooltip>

          {/* Consumer Rate */}
          <FormFieldWithTooltip
            label="Consumer Rate (optional)"
            tooltip="Maximum data rate for consumer fetch requests. Enter a number and select the unit (B/s, KB/s, MB/s, or GB/s). For example: 200 MB/s means consumers can fetch up to 200 megabytes per second. Leave empty for no limit."
          >
            <HStack>
              <Input {...register('consumerRateValue')} placeholder="e.g., 200" type="number" step="0.01" min="0" />
              <Box minWidth="120px">
                <Controller
                  name="consumerRateUnit"
                  control={control}
                  render={({ field }) => (
                    <Select<'B/s' | 'KB/s' | 'MB/s' | 'GB/s'>
                      value={{ value: field.value }}
                      onChange={(option) => {
                        if (isSingleValue(option) && option?.value) {
                          field.onChange(option.value);
                        }
                      }}
                      options={[
                        { value: 'B/s', label: 'B/s' },
                        { value: 'KB/s', label: 'KB/s' },
                        { value: 'MB/s', label: 'MB/s' },
                        { value: 'GB/s', label: 'GB/s' },
                      ]}
                    />
                  )}
                />
              </Box>
            </HStack>
            <HStack mt={1} spacing={2}>
              <Text fontSize="sm" color="gray.500">
                Maximum throughput for consumer fetch requests
              </Text>
              <RateDisplay
                control={control}
                unitField="consumerRateUnit"
                valueField="consumerRateValue"
                colorScheme="blue"
              />
            </HStack>
          </FormFieldWithTooltip>

          {/* Controller Rate */}
          <FormFieldWithTooltip
            label="Controller Mutation Rate (optional)"
            tooltip="Rate limit for administrative operations like topic creation, partition changes, and configuration updates. Measured in operations per second."
          >
            <HStack>
              <Input {...register('controllerRate')} placeholder="e.g., 10" type="number" step="1" min="0" />
              <Text width="80px" color="gray.500" bg="gray.50" p={2} borderRadius="md" fontSize="sm">
                /second
              </Text>
            </HStack>
            <HStack mt={1} spacing={2}>
              <Text fontSize="sm" color="gray.500">
                Rate limit for topic creation, partition changes (operations per second)
              </Text>
              {watchedControllerRate && (
                <Badge colorScheme="purple" variant="outline">
                  {watchedControllerRate}/sec
                </Badge>
              )}
            </HStack>
          </FormFieldWithTooltip>

          {/* Validation warning for empty values */}
          {!hasValues && (
            <Alert status="warning" variant="subtle" size="sm">
              <AlertIcon />
              <Text fontSize="sm">At least one quota value must be specified to create a quota</Text>
            </Alert>
          )}
        </VStack>

        {/* Preview */}
        {getEffectiveQuotaPreview()}

        {/* Form Actions */}
        <HStack spacing={4} justifyContent="flex-end">
          <Button variant="outline" onClick={onCancel} isDisabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => setIsPreviewMode(!isPreviewMode)} isDisabled={isSubmitting}>
            {isPreviewMode ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button
            type="submit"
            variant="solid"
            isLoading={isSubmitting}
            loadingText={isEdit ? 'Updating...' : 'Creating...'}
            isDisabled={hasErrors || !hasValues || isSubmitting}
          >
            {isEdit ? 'Update Quota' : 'Create Quota'}
          </Button>
        </HStack>
      </Stack>
    </form>
  );
};
