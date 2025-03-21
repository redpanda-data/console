import {
  Button,
  ButtonGroup,
  Link as ChakraLink,
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
import { runInAction } from 'mobx';
import { useEffect, useState } from 'react';
import { AiOutlineDelete } from 'react-icons/ai';
import { useListPipelinesQuery } from 'react-query/api/pipeline';
import { Link as ReactRouterLink, useHistory } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { DeleteAgentModal } from './delete-agent-modal';
import { AgentStateDisplayValue } from './details/agent-state-display-value';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Agents';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'Agents', linkTo: '/agents', heading: 'Agents' });
  });
};

export const AgentListPage = () => {
  const history = useHistory();

  const [nameContains, setNameContains] = useState('');

  const [deleteAgentId, setDeleteAgentId] = useState<string>('');

  const {
    isOpen: isDeleteAgentModalOpen,
    onOpen: onDeleteAgentModalOpen,
    onClose: onDeleteAgentModalClose,
  } = useDisclosure();
  const {
    data: agentList,
    isLoading: isAgentListLoading,
    isError: isAgentListError,
  } = useListPipelinesQuery(
    // new ListPipelinesRequestDataPlane({
    //   filter: nameContains
    //     ? new ListPipelinesRequest_Filter({
    //         nameContains,
    //         tags: {
    //           type: 'agent',
    //         },
    //       })
    //     : undefined,
    // }),
  );

  useEffect(() => {
    updatePageTitle();
  }, []);

  const handleDeleteAgentModal = (agentId: string) => {
    setDeleteAgentId(agentId);
    onDeleteAgentModalOpen();
  };

  if (isAgentListError) {
    return <Empty />;
  }

  return (
    <>
      <Stack spacing={8}>
        <Stack spacing={4}>
          <Text>Manage your AI agents.</Text>
          <ButtonGroup>
            <Button
              variant="outline"
              onClick={() => {
                history.push('/agents/create');
              }}
              data-testid="create-agent-button"
            >
              Create new Agent
            </Button>
          </ButtonGroup>
        </Stack>

        <SearchField
          width="350px"
          searchText={nameContains}
          setSearchText={setNameContains}
          placeholderText="Filter agents..."
        />

        {isAgentListLoading ? (
          <Flex justifyContent="center" padding={8}>
            <Spinner size="lg" />
          </Flex>
        ) : agentList?.pipelines?.length === 0 ? (
          <Empty />
        ) : (
          <DataTable
            data={agentList?.pipelines ?? []}
            pagination
            defaultPageSize={10}
            sorting
            columns={[
              {
                header: 'Name',
                cell: ({ row: { original } }) => (
                  <ChakraLink
                    as={ReactRouterLink}
                    to={`/agents/${original?.id}`}
                    textDecoration="none"
                    _hover={{
                      textDecoration: 'none',
                    }}
                  >
                    <Text data-testid={`agent-name-${original?.id}`}>{original?.displayName}</Text>
                  </ChakraLink>
                ),
                size: Number.POSITIVE_INFINITY,
              },
              {
                header: 'Description',
                cell: ({ row: { original } }) => (
                  <Text data-testid={`agent-description-${original?.id}`}>{original?.description}</Text>
                ),
              },
              {
                header: 'Status',
                id: 'status',
                cell: ({ row: { original } }) => <AgentStateDisplayValue state={original?.state} />,
              },
              {
                header: '',
                id: 'actions',
                cell: ({ row: { original } }) => (
                  <HStack spacing={4} justifyContent="flex-end">
                    <Icon
                      data-testid={`delete-agent-${original?.id}`}
                      as={AiOutlineDelete}
                      onClick={() => handleDeleteAgentModal(original?.id ?? '')}
                      cursor="pointer"
                      aria-label="Delete agent"
                    />
                  </HStack>
                ),
              },
            ]}
          />
        )}
      </Stack>
      <DeleteAgentModal
        isOpen={isDeleteAgentModalOpen}
        onClose={onDeleteAgentModalClose}
        agentId={deleteAgentId}
        agentName={agentList?.pipelines?.find((pipeline) => pipeline?.id === deleteAgentId)?.displayName ?? ''}
      />
    </>
  );
};
