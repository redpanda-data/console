import { create } from '@bufbuild/protobuf';
import {
  Badge,
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
  useDisclosure,
} from '@redpanda-data/ui';
import ErrorResult from 'components/misc/ErrorResult';
import { runInAction } from 'mobx';
import {
  ListSecretsFilterSchema,
  ListSecretsRequestSchema,
  Scope,
  ScopeSchema,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect, useState } from 'react';
import { AiOutlineDelete, AiOutlineEdit } from 'react-icons/ai';
import { useListSecretsQuery } from 'react-query/api/secret';
import { uiState } from 'state/uiState';

import { CreateSecretModal } from './create-secret-modal';
import { DeleteSecretModal } from './delete-secret-modal';
import { UpdateSecretModal } from './update-secret-modal';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Secrets Store';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'Secrets Store', linkTo: '/secrets', heading: 'Secrets Store' });
  });
};

/**
 * Interface for secret form data
 */
export type SecretFormData = {
  id: string;
  value: string;
  labels: { key: string; value: string }[];
};

export const getScopeDisplayValue = (scope: Scope) => {
  switch (scope) {
    case Scope.REDPANDA_CONNECT:
      return 'RP Connect';
    case Scope.REDPANDA_CLUSTER:
      return 'Cluster';
    case Scope.MCP_SERVER:
      return 'MCP Server';
    case Scope.AI_AGENT:
      return 'AI Agent';
    case Scope.UNSPECIFIED:
      return 'Unspecified';
    default:
      return ScopeSchema.values.find((value) => value.number === scope)?.name;
  }
};

/**
 * Main component for the Secrets Store page
 */
export const SecretsStorePage = () => {
  // State for search query and edit modal
  const [nameContains, setNameContains] = useState('');

  const [updateSecretId, setUpdateSecretId] = useState<string>('');
  const [deleteSecretId, setDeleteSecretId] = useState<string>('');
  const {
    isOpen: isCreateSecretModalOpen,
    onOpen: onCreateSecretModalOpen,
    onClose: onCreateSecretModalClose,
  } = useDisclosure();
  const {
    isOpen: isUpdateSecretModalOpen,
    onOpen: onUpdateSecretModalOpen,
    onClose: onUpdateSecretModalClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteSecretModalOpen,
    onOpen: onDeleteSecretModalOpen,
    onClose: onDeleteSecretModalClose,
  } = useDisclosure();

  const {
    data: secretList,
    isLoading: isSecretListLoading,
    isError: isSecretListError,
    error: secretListError,
  } = useListSecretsQuery(
    create(ListSecretsRequestSchema, {
      filter: create(ListSecretsFilterSchema, {
        nameContains,
      }),
    })
  );

  // Handle opening edit modal for a specific secret
  const handleUpdateSecretModal = (secretId: string) => {
    setUpdateSecretId(secretId);
    onUpdateSecretModalOpen();
  };

  const handleDeleteSecretModal = (secretId: string) => {
    setDeleteSecretId(secretId);
    onDeleteSecretModalOpen();
  };

  // Only run once
  useEffect(() => {
    updatePageTitle();
  }, []);

  if (isSecretListError) {
    return <ErrorResult error={secretListError} message="Please try again later." title="Error loading secrets" />;
  }

  return (
    <>
      <Stack spacing={8}>
        <Stack spacing={4}>
          <Text>
            This page lets you list, edit, and delete the secrets used in your dataplane. You can create secrets on this
            page and reference them when creating a new resource such as Redpanda Connect pipelines.
          </Text>
          <ButtonGroup>
            <Button data-testid="create-secret-button" onClick={onCreateSecretModalOpen} variant="outline">
              Create secret
            </Button>
          </ButtonGroup>
        </Stack>

        <SearchField
          placeholderText="Filter secrets..."
          searchText={nameContains}
          setSearchText={setNameContains}
          width="350px"
        />

        {(() => {
          if (isSecretListLoading) {
            return (
              <Flex justifyContent="center" padding={8}>
                <Spinner size="lg" />
              </Flex>
            );
          }
          if (secretList?.secrets?.length === 0) {
            return <Empty />;
          }
          return (
            <DataTable
              columns={[
                {
                  header: 'ID',
                  cell: ({ row: { original } }) => (
                    <Text data-testid={`secret-text-${original?.id}`}>{original?.id}</Text>
                  ),
                  size: 200,
                },
                {
                  header: 'Labels',
                  id: 'labels',
                  cell: ({ row: { original } }) => {
                    const labels = original?.labels;
                    if (
                      !labels ||
                      Object.keys(labels).filter((key) => !(key === 'owner' && labels[key] === 'console')).length === 0
                    ) {
                      return <Text>No labels</Text>;
                    }
                    return (
                      <Flex gap={2} wrap="wrap">
                        {Object.entries(labels)
                          .filter(([key, value]) => !(key === 'owner' && value === 'console'))
                          .map(([key, value]) => (
                            <Badge borderRadius="full" key={`${original?.id}-${key}`} variant="inverted">
                              <Text>
                                {key}: {value}
                              </Text>
                            </Badge>
                          ))}
                      </Flex>
                    );
                  },
                  size: 250,
                },
                {
                  header: 'Scope',
                  id: 'scope',
                  cell: ({ row: { original } }) =>
                    original?.scopes.map((scope) => getScopeDisplayValue(scope)).join(', ') ?? 'No scopes',
                  size: 50,
                },
                {
                  header: '',
                  id: 'actions',
                  cell: ({ row: { original } }) => (
                    <HStack justifyContent="flex-end" spacing={4} width="100%">
                      <Icon
                        aria-label="Edit secret"
                        as={AiOutlineEdit}
                        cursor="pointer"
                        data-testid={`edit-secret-${original?.id}`}
                        onClick={() => handleUpdateSecretModal(original?.id ?? '')}
                      />
                      <Icon
                        aria-label="Delete secret"
                        as={AiOutlineDelete}
                        cursor="pointer"
                        data-testid={`delete-secret-${original?.id}`}
                        onClick={() => handleDeleteSecretModal(original?.id ?? '')}
                      />
                    </HStack>
                  ),
                },
              ]}
              data={secretList?.secrets ?? []}
              defaultPageSize={10}
              pagination
              sorting
            />
          );
        })()}
      </Stack>

      <CreateSecretModal isOpen={isCreateSecretModalOpen} onClose={onCreateSecretModalClose} />
      <UpdateSecretModal
        isOpen={isUpdateSecretModalOpen}
        onClose={onUpdateSecretModalClose}
        secretId={updateSecretId}
      />
      <DeleteSecretModal
        isOpen={isDeleteSecretModalOpen}
        onClose={onDeleteSecretModalClose}
        secretId={deleteSecretId}
      />
    </>
  );
};
