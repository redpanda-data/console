import { create } from '@bufbuild/protobuf';
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  DataTable,
  Empty,
  Flex,
  HStack,
  Icon,
  SearchField,
  Spinner,
  Stack,
  Text,
  Tooltip,
  useDisclosure,
} from '@redpanda-data/ui';
import ErrorResult from 'components/misc/ErrorResult';
import {
  ListQuotasRequestSchema,
  Quota_EntityType,
  Quota_ValueType,
} from 'protogen/redpanda/api/dataplane/v1/quota_pb';
import { useState } from 'react';
import { AiOutlineDelete, AiOutlineEdit, AiOutlinePlus } from 'react-icons/ai';
import { MdContentCopy } from 'react-icons/md';
import { formatByteRate, getEntityTypeLabel, MAX_QUOTA_PAGE_SIZE, useListQuotasQuery } from 'react-query/api/quota';
import { useNavigate } from 'react-router-dom';
import { QuotaPrecedenceBanner } from './components/quota-precedence-banner';
import { QuotaResolverButton } from './components/quota-resolver';
import { BulkDeleteModal } from './modals/bulk-delete-modal';
import { DeleteQuotaModal } from './modals/delete-quota-modal';

export const QuotaListPage = () => {
  const navigate = useNavigate();
  const [nameContains, setNameContains] = useState('');
  const [selectedQuotas, setSelectedQuotas] = useState<string[]>([]);
  const [deleteQuotaId, setDeleteQuotaId] = useState<string>('');

  // Helper function to get precedence level for sorting and display
  const getPrecedence = (quota: any) => {
    const entityType = quota.entity?.entityType;
    const entityName = quota.entity?.entityName;

    if (entityType === Quota_EntityType.CLIENT_ID && entityName) {
      return { level: 3, label: 'Exact', color: 'red' as const };
    }
    if (entityType === Quota_EntityType.CLIENT_ID_PREFIX) {
      return { level: 2, label: 'Prefix', color: 'orange' as const };
    }
    return { level: 1, label: 'Default', color: 'blue' as const };
  };

  // Helper function to find effective quota for a specific client ID (for demonstration)
  const getEffectiveQuotaForClient = (clientId: string, valueType: Quota_ValueType) => {
    if (!quotaList?.quotas) return null;

    let bestMatch: any = null;
    let highestPrecedence = -1;

    quotaList.quotas.forEach((quota: any) => {
      const value = quota.values?.find((v: any) => v.valueType === valueType);
      if (!value) return;

      const entityType = quota.entity?.entityType;
      const entityName = quota.entity?.entityName || '';
      let precedence = -1;
      let matches = false;

      // Exact match
      if (entityType === Quota_EntityType.CLIENT_ID && entityName === clientId) {
        matches = true;
        precedence = 3;
      }
      // Prefix match
      else if (entityType === Quota_EntityType.CLIENT_ID_PREFIX && clientId.startsWith(entityName)) {
        matches = true;
        precedence = 2;
      }
      // Default match
      else if (entityType === Quota_EntityType.CLIENT_ID && entityName === '') {
        matches = true;
        precedence = 1;
      }

      if (matches && precedence > highestPrecedence) {
        highestPrecedence = precedence;
        bestMatch = { quota, value };
      }
    });

    return bestMatch;
  };

  const { isOpen: isDeleteModalOpen, onOpen: onDeleteModalOpen, onClose: onDeleteModalClose } = useDisclosure();

  const {
    isOpen: isBulkDeleteModalOpen,
    onOpen: onBulkDeleteModalOpen,
    onClose: onBulkDeleteModalClose,
  } = useDisclosure();

  const {
    data: quotaList,
    isLoading: isQuotaListLoading,
    isError: isQuotaListError,
    error: quotaListError,
  } = useListQuotasQuery(
    create(ListQuotasRequestSchema, {
      filter: {
        entityName: nameContains || undefined,
      },
      pageSize: MAX_QUOTA_PAGE_SIZE,
    }),
  );

  const handleDeleteQuota = (quotaId: string) => {
    setDeleteQuotaId(quotaId);
    onDeleteModalOpen();
  };

  const handleEditQuota = (quotaId: string) => {
    navigate(`/quotas/${quotaId}/edit`);
  };

  const handleDuplicateQuota = (quotaId: string) => {
    navigate(`/quotas/create?duplicate=${quotaId}`);
  };

  const handleBulkDelete = () => {
    if (selectedQuotas.length > 0) {
      onBulkDeleteModalOpen();
    }
  };

  if (isQuotaListError) {
    return <ErrorResult error={quotaListError} title="Error loading quotas" message="Please try again later." />;
  }

  return (
    <>
      <Stack spacing={8}>
        <QuotaPrecedenceBanner />

        <Stack spacing={4}>
          <Text fontSize="lg" fontWeight="semibold">
            Manage client throughput limits and controller mutation rates
          </Text>

          <HStack spacing={4}>
            <Button
              variant="solid"
              leftIcon={<Icon as={AiOutlinePlus} />}
              onClick={() => navigate('/quotas/create')}
              data-testid="create-quota-button"
            >
              Create Quota
            </Button>

            <ButtonGroup>
              <Button
                variant="outline"
                onClick={handleBulkDelete}
                isDisabled={selectedQuotas.length === 0}
                leftIcon={<Icon as={AiOutlineDelete} />}
                data-testid="bulk-delete-button"
              >
                Delete Selected ({selectedQuotas.length})
              </Button>
              <QuotaResolverButton />
            </ButtonGroup>
          </HStack>
        </Stack>

        <HStack spacing={4}>
          <SearchField
            width="350px"
            searchText={nameContains}
            setSearchText={setNameContains}
            placeholderText="Filter quotas by entity name..."
          />

          {/* Quick resolver results when typing a client ID */}
          {nameContains && nameContains.length > 2 && (
            <Box bg="gray.50" p={3} borderRadius="md" border="1px solid" borderColor="gray.200">
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Effective quotas for "{nameContains}":
              </Text>
              <HStack spacing={4} wrap="wrap">
                {[
                  Quota_ValueType.PRODUCER_BYTE_RATE,
                  Quota_ValueType.CONSUMER_BYTE_RATE,
                  Quota_ValueType.CONTROLLER_MUTATION_RATE,
                ].map((valueType) => {
                  const effective = getEffectiveQuotaForClient(nameContains, valueType);
                  const precedence = effective ? getPrecedence(effective.quota) : null;

                  return (
                    <Box key={valueType}>
                      <Text fontSize="xs" color="gray.600">
                        {valueType === Quota_ValueType.PRODUCER_BYTE_RATE
                          ? 'Producer'
                          : valueType === Quota_ValueType.CONSUMER_BYTE_RATE
                            ? 'Consumer'
                            : 'Controller'}
                      </Text>
                      {effective ? (
                        <HStack spacing={1}>
                          <Badge size="sm" colorScheme={precedence?.color}>
                            {valueType === Quota_ValueType.CONTROLLER_MUTATION_RATE
                              ? `${effective.value.value}/s`
                              : formatByteRate(effective.value.value)}
                          </Badge>
                          <Text fontSize="xs" color="gray.500">
                            ({precedence?.label})
                          </Text>
                        </HStack>
                      ) : (
                        <Text fontSize="xs" color="gray.400">
                          No limit
                        </Text>
                      )}
                    </Box>
                  );
                })}
              </HStack>
            </Box>
          )}
        </HStack>

        {isQuotaListLoading ? (
          <Flex justifyContent="center" padding={8}>
            <Spinner size="lg" />
          </Flex>
        ) : quotaList?.quotas?.length === 0 ? (
          <Empty
            title="No quotas found"
            description="Create your first quota to limit client throughput or controller mutations"
            action={
              <Button variant="outline" onClick={() => navigate('/quotas/create')}>
                Create Quota
              </Button>
            }
          />
        ) : (
          <DataTable
            data={quotaList?.quotas ?? []}
            pagination
            defaultPageSize={25}
            sorting
            rowSelection="multiple"
            onRowSelectionChange={setSelectedQuotas}
            columns={[
              {
                header: 'Precedence',
                id: 'precedence',
                accessorFn: (row) => getPrecedence(row).level,
                cell: ({ row: { original } }) => {
                  const precedence = getPrecedence(original);
                  return (
                    <Tooltip label={`${precedence.label} match - precedence level ${precedence.level}/3`}>
                      <Badge colorScheme={precedence.color} variant="outline">
                        {precedence.label}
                      </Badge>
                    </Tooltip>
                  );
                },
                size: 80,
              },
              {
                header: 'Entity Type',
                accessorFn: (row) => getEntityTypeLabel(row.entity?.entityType || Quota_EntityType.UNSPECIFIED),
                id: 'entityType',
                cell: ({ row: { original } }) => (
                  <Text>{getEntityTypeLabel(original.entity?.entityType || Quota_EntityType.UNSPECIFIED)}</Text>
                ),
              },
              {
                header: 'Entity Name',
                accessorFn: (row) => row.entity?.entityName || '<default>',
                id: 'entityName',
                cell: ({ row: { original } }) => {
                  const _precedence = getPrecedence(original);
                  const entityName = original.entity?.entityName || '<default>';
                  return (
                    <HStack spacing={2}>
                      <Text
                        fontWeight={!original.entity?.entityName ? 'bold' : 'normal'}
                        color={!original.entity?.entityName ? 'blue.600' : 'inherit'}
                      >
                        {entityName}
                      </Text>
                      {original.entity?.entityType === Quota_EntityType.CLIENT_ID_PREFIX && (
                        <Badge size="sm" variant="outline" colorScheme="gray">
                          *
                        </Badge>
                      )}
                    </HStack>
                  );
                },
              },
              {
                header: 'Producer Rate',
                id: 'producerRate',
                cell: ({ row: { original } }) => {
                  const producerValue = original.values?.find(
                    (v) => v.valueType === Quota_ValueType.PRODUCER_BYTE_RATE,
                  );
                  return producerValue ? (
                    <Tooltip label={`${producerValue.value.toLocaleString()} bytes/sec`}>
                      <Badge colorScheme="green" variant="outline">
                        {formatByteRate(producerValue.value)}
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Text color="gray.400" fontSize="sm">
                      No limit
                    </Text>
                  );
                },
              },
              {
                header: 'Consumer Rate',
                id: 'consumerRate',
                cell: ({ row: { original } }) => {
                  const consumerValue = original.values?.find(
                    (v) => v.valueType === Quota_ValueType.CONSUMER_BYTE_RATE,
                  );
                  return consumerValue ? (
                    <Tooltip label={`${consumerValue.value.toLocaleString()} bytes/sec`}>
                      <Badge colorScheme="blue" variant="outline">
                        {formatByteRate(consumerValue.value)}
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Text color="gray.400" fontSize="sm">
                      No limit
                    </Text>
                  );
                },
              },
              {
                header: 'Controller Rate',
                id: 'controllerRate',
                cell: ({ row: { original } }) => {
                  const controllerValue = original.values?.find(
                    (v) => v.valueType === Quota_ValueType.CONTROLLER_MUTATION_RATE,
                  );
                  return controllerValue ? (
                    <Tooltip label="Operations per second (topic creation, partition changes, etc.)">
                      <Badge colorScheme="purple" variant="outline">
                        {controllerValue.value}/s
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Text color="gray.400" fontSize="sm">
                      No limit
                    </Text>
                  );
                },
              },
              {
                header: '',
                id: 'actions',
                cell: ({ row: { original } }) => {
                  const quotaId = `${original.entity?.entityType}-${original.entity?.entityName || 'default'}`;
                  return (
                    <HStack spacing={2} justifyContent="flex-end">
                      <Icon
                        as={AiOutlineEdit}
                        cursor="pointer"
                        onClick={() => handleEditQuota(quotaId)}
                        aria-label="Edit quota"
                        data-testid={`edit-quota-${quotaId}`}
                      />
                      <Icon
                        as={MdContentCopy}
                        cursor="pointer"
                        onClick={() => handleDuplicateQuota(quotaId)}
                        aria-label="Duplicate quota"
                        data-testid={`duplicate-quota-${quotaId}`}
                      />
                      <Icon
                        as={AiOutlineDelete}
                        cursor="pointer"
                        onClick={() => handleDeleteQuota(quotaId)}
                        aria-label="Delete quota"
                        data-testid={`delete-quota-${quotaId}`}
                      />
                    </HStack>
                  );
                },
              },
            ]}
          />
        )}
      </Stack>

      <DeleteQuotaModal isOpen={isDeleteModalOpen} onClose={onDeleteModalClose} quotaId={deleteQuotaId} />

      <BulkDeleteModal
        isOpen={isBulkDeleteModalOpen}
        onClose={onBulkDeleteModalClose}
        selectedQuotaIds={selectedQuotas}
        onSuccess={() => {
          setSelectedQuotas([]);
          onBulkDeleteModalClose();
        }}
      />
    </>
  );
};
