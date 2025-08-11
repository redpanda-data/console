import { create } from '@bufbuild/protobuf';
import { Box, Flex, Heading, Spinner, Stack } from '@redpanda-data/ui';
import ErrorResult from 'components/misc/ErrorResult';
import { runInAction } from 'mobx';
import {
  ListQuotasRequestSchema,
  Quota_EntityType,
  Quota_ValueType,
} from 'protogen/redpanda/api/dataplane/v1/quota_pb';
import { useEffect } from 'react';
import { useListQuotasQuery } from 'react-query/api/quota';
import { useNavigate, useParams } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { QuotaForm, type QuotaFormData } from './components/quota-form';
import { QuotaPrecedenceBanner } from './components/quota-precedence-banner';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = (quotaId?: string) => {
  runInAction(() => {
    uiState.pageTitle = 'Quotas';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure clean navigation
    uiState.pageBreadcrumbs.push({ title: 'Quotas', linkTo: '/quotas', heading: 'Quotas' });
    uiState.pageBreadcrumbs.push({
      title: quotaId ? `Edit ${quotaId}` : 'Edit Quota',
      linkTo: `/quotas/${quotaId}/edit`,
      heading: 'Edit Quota',
    });
  });
};

export const QuotaEditPage = () => {
  const navigate = useNavigate();
  const { quotaId } = useParams<{ quotaId: string }>();

  useEffect(() => {
    updatePageTitle(quotaId);
  }, [quotaId]);

  // Parse quota ID to get entity details
  const parseQuotaId = (id: string) => {
    const [entityTypeStr, entityName] = id.split('-', 2);
    const entityType = Number.parseInt(entityTypeStr) as Quota_EntityType;
    return {
      entityType,
      entityName: entityName === 'default' ? '' : entityName,
    };
  };

  const { entityType, entityName } = quotaId
    ? parseQuotaId(quotaId)
    : {
        entityType: Quota_EntityType.UNSPECIFIED,
        entityName: '',
      };

  // Fetch the specific quota to edit
  const {
    data: quotaList,
    isLoading,
    isError,
    error,
  } = useListQuotasQuery(
    create(ListQuotasRequestSchema, {
      filter: {
        entityType: entityType !== Quota_EntityType.UNSPECIFIED ? entityType : undefined,
        entityName: entityName || undefined,
      },
    }),
  );

  const handleSuccess = () => {
    navigate('/quotas');
  };

  const handleCancel = () => {
    navigate('/quotas');
  };

  if (isLoading) {
    return (
      <Flex justifyContent="center" padding={8}>
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (isError) {
    return <ErrorResult error={error} title="Error loading quota" message="Please try again later." />;
  }

  // Find the matching quota from the response
  const quota = quotaList?.quotas?.find(
    (q) => q.entity?.entityType === entityType && (q.entity?.entityName || '') === entityName,
  );

  if (!quota) {
    return <ErrorResult title="Quota not found" message="The requested quota does not exist." />;
  }

  // Convert quota data to form format
  const getInitialFormData = (): Partial<QuotaFormData> => {
    const producerValue = quota.values?.find((v) => v.valueType === Quota_ValueType.PRODUCER_BYTE_RATE);
    const consumerValue = quota.values?.find((v) => v.valueType === Quota_ValueType.CONSUMER_BYTE_RATE);
    const controllerValue = quota.values?.find((v) => v.valueType === Quota_ValueType.CONTROLLER_MUTATION_RATE);

    // Convert byte rates to human-readable format
    const getByteRateDisplayValue = (value?: number) => {
      if (!value) return { value: '', unit: 'MB/s' as const };

      if (value >= 1024 * 1024 * 1024) {
        return {
          value: (value / (1024 * 1024 * 1024)).toString(),
          unit: 'GB/s' as const,
        };
      }
      if (value >= 1024 * 1024) {
        return {
          value: (value / (1024 * 1024)).toString(),
          unit: 'MB/s' as const,
        };
      }
      if (value >= 1024) {
        return {
          value: (value / 1024).toString(),
          unit: 'KB/s' as const,
        };
      }
      return {
        value: value.toString(),
        unit: 'B/s' as const,
      };
    };

    const producerRate = getByteRateDisplayValue(producerValue?.value);
    const consumerRate = getByteRateDisplayValue(consumerValue?.value);

    return {
      entityType: quota.entity?.entityType || Quota_EntityType.CLIENT_ID,
      entityName: quota.entity?.entityName || '',
      producerRateValue: producerRate.value,
      producerRateUnit: producerRate.unit,
      consumerRateValue: consumerRate.value,
      consumerRateUnit: consumerRate.unit,
      controllerRate: controllerValue?.value,
    };
  };

  return (
    <Box maxWidth="800px">
      <Stack spacing={6}>
        <Box>
          <Heading as="h1" size="lg" mb={2}>
            Edit Quota
          </Heading>
          <text fontSize="md" color="gray.600">
            Modifying quota for {quota.entity?.entityName || '<default>'}
          </text>
        </Box>

        <QuotaPrecedenceBanner />

        <QuotaForm initialData={getInitialFormData()} onSuccess={handleSuccess} onCancel={handleCancel} isEdit={true} />
      </Stack>
    </Box>
  );
};
