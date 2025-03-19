import {
  Box,
  Button,
  ButtonGroup,
  DataTable,
  Flex,
  HStack,
  Heading,
  Icon,
  SearchField,
  Spinner,
  Stack,
  Text,
  VStack,
  useDisclosure,
} from '@redpanda-data/ui';
import { runInAction } from 'mobx';
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
}

/**
 * Main component for the Secrets Store page
 */
export const SecretsStorePage = () => {
  // State for search query and edit modal
  const [searchQuery, setSearchQuery] = useState('');

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

  // Fetch secrets data
  const { data: secretsData, isLoading, isError } = useListSecretsQuery();

  // Filter secrets based on search query
  const filteredSecrets =
    secretsData?.secrets?.filter((secret) => {
      if (!searchQuery) return true;
      try {
        const searchRegExp = new RegExp(searchQuery, 'i');
        return secret?.id.match(searchRegExp);
      } catch {
        return false;
      }
    }) || [];

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

  if (isLoading) {
    return (
      <Flex justifyContent="center" padding={8}>
        <Spinner size="lg" />
      </Flex>
    );
  }

  if (isError) {
    return (
      <Box p={4} textAlign="center">
        <Text color="red.500">Error loading secrets. Please try again later.</Text>
      </Box>
    );
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
              Create new Secret
            </Button>
          </ButtonGroup>
        </Stack>

        <SearchField
          width="350px"
          searchText={searchQuery}
          setSearchText={setSearchQuery}
          placeholderText="Filter secrets..."
        />

        {filteredSecrets.length === 0 ? (
          <VStack spacing={4} py={8} textAlign="center">
            <Heading size="md">No secrets found</Heading>
            <Text>You don't have any secrets yet. Create your first secret to get started.</Text>
          </VStack>
        ) : (
          <DataTable
            data={filteredSecrets}
            pagination
            defaultPageSize={10}
            sorting
            columns={[
              {
                header: 'ID',
                cell: ({ row: { original } }) => (
                  <Text data-testid={`secret-text-${original?.id}`}>{original?.id}</Text>
                ),
                size: Number.POSITIVE_INFINITY,
              },
              {
                header: '',
                id: 'actions',
                cell: ({ row: { original } }) => (
                  <HStack spacing={4} alignSelf="flex-end">
                    <Icon
                      data-testid={`edit-secret-${original?.id}`}
                      as={AiOutlineEdit}
                      onClick={() => handleUpdateSecretModal(original?.id ?? '')}
                    />
                    <Icon
                      data-testid={`delete-secret-${original?.id}`}
                      as={AiOutlineDelete}
                      onClick={() => handleDeleteSecretModal(original?.id ?? '')}
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
