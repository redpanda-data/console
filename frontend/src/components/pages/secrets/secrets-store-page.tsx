import { proto3 } from '@bufbuild/protobuf';
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
import { ListSecretsFilter, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { ListSecretsRequest as ListSecretsRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
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
export interface SecretFormData {
  id: string;
  value: string;
  labels: { key: string; value: string }[];
}

export const getScopeDisplayValue = (scope: Scope) => {
  switch (scope) {
    case Scope.REDPANDA_CONNECT:
      return 'RP Connect';
    case Scope.UNSPECIFIED:
      return 'Unspecified';
    default:
      return proto3.getEnumType(Scope).findNumber(scope)?.name;
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
    new ListSecretsRequestDataPlane({
      filter: new ListSecretsFilter({
        nameContains,
      }),
    }),
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
    return <ErrorResult error={secretListError} title="Error loading secrets" message="Please try again later." />;
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
            <Button variant="outline" onClick={onCreateSecretModalOpen} data-testid="create-secret-button">
              Create secret
            </Button>
          </ButtonGroup>
        </Stack>

        <SearchField
          width="350px"
          searchText={nameContains}
          setSearchText={setNameContains}
          placeholderText="Filter secrets..."
        />

        {isSecretListLoading ? (
          <Flex justifyContent="center" padding={8}>
            <Spinner size="lg" />
          </Flex>
        ) : secretList?.secrets?.length === 0 ? (
          <Empty />
        ) : (
          <DataTable
            data={secretList?.secrets ?? []}
            pagination
            defaultPageSize={10}
            sorting
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
                    <Flex wrap="wrap" gap={2}>
                      {Object.entries(labels)
                        .filter(([key, value]) => !(key === 'owner' && value === 'console'))
                        .map(([key, value]) => (
                          <Badge variant="inverted" key={`${original?.id}-${key}`} borderRadius="full">
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
                  original?.scopes.map((scope) => <Text key={scope}>{getScopeDisplayValue(scope)}</Text>),
                size: 50,
              },
              {
                header: '',
                id: 'actions',
                cell: ({ row: { original } }) => (
                  <HStack spacing={4} justifyContent="flex-end" width="100%">
                    <Icon
                      data-testid={`edit-secret-${original?.id}`}
                      as={AiOutlineEdit}
                      onClick={() => handleUpdateSecretModal(original?.id ?? '')}
                      cursor="pointer"
                      aria-label="Edit secret"
                    />
                    <Icon
                      data-testid={`delete-secret-${original?.id}`}
                      as={AiOutlineDelete}
                      onClick={() => handleDeleteSecretModal(original?.id ?? '')}
                      cursor="pointer"
                      aria-label="Delete secret"
                    />
                  </HStack>
                ),
              },
            ]}
          />
        )}
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
