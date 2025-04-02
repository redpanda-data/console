import {
  Badge,
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
import ErrorResult from 'components/misc/ErrorResult';
import type { IRouteEntry } from 'components/routes';
import { runInAction } from 'mobx';
import { type ReactNode, useEffect, useState } from 'react';
import { AiOutlineDelete } from 'react-icons/ai';
import { useListAgentsQuery } from 'react-query/api/agent';
import { Link as ReactRouterLink, useHistory } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { SidebarItemBadge } from '../../misc/sidebar-item-badge';
import { DeleteAgentModal } from './delete-agent-modal';
import { AgentStateDisplayValue } from './details/agent-state-display-value';

interface AgentSidebarItemTitleProps {
  route: IRouteEntry;
}

export const getAgentSidebarItemTitle = ({ route }: AgentSidebarItemTitleProps) => (
  <HStack spacing="12px" key={`${route.path}-title`}>
    <Text>{route.title}</Text>
    <SidebarItemBadge>beta</SidebarItemBadge>
  </HStack>
);

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Agents';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'AI Agents', linkTo: '/agents', heading: 'AI Agents' });
  });
};

interface CellLinkProps {
  agentId: string;
  children: ReactNode;
}

/**
 * @description Workaround because DataTable does not let us mark the whole row as a link
 * @see https://tanstack.com/table/v8/docs/guide/row-selection for proper implementation
 * TODO: Remove this and use @tanstack/react-table properly, for example use div instead of span to wrap the text
 *
 */
const CellLink = ({ agentId, children }: CellLinkProps) => (
  <ChakraLink
    as={ReactRouterLink}
    to={`/agents/${agentId}`}
    textDecoration="none"
    _hover={{
      textDecoration: 'none',
    }}
    width="100%"
    display="block"
  >
    {children}
  </ChakraLink>
);

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
    error: agentListError,
  } = useListAgentsQuery();

  useEffect(() => {
    updatePageTitle();
  }, []);

  const handleDeleteAgentModal = (agentId: string) => {
    setDeleteAgentId(agentId);
    onDeleteAgentModalOpen();
  };

  if (isAgentListError) {
    return <ErrorResult error={agentListError} title="Error loading agents" message="Please try again later." />;
  }

  return (
    <>
      <Stack spacing={8}>
        <Stack spacing={4}>
          <Text>
            AI Agents are autonomous, general-purpose assistants that combine language understanding with the ability to
            take action. You can enrich them with your own proprietary data, connect them to tools, and let them reason
            through complex problems — iterating toward the best solution.
          </Text>
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
        ) : agentList?.agents?.length === 0 ? (
          <Empty />
        ) : (
          <DataTable
            data={agentList?.agents ?? []}
            pagination
            defaultPageSize={10}
            sorting
            columns={[
              {
                header: 'Name',
                cell: ({ row: { original } }) => (
                  <CellLink agentId={original?.id ?? ''}>
                    <Text data-testid={`agent-name-${original?.id}`}>{original?.displayName}</Text>
                  </CellLink>
                ),
              },
              {
                header: 'Status',
                id: 'status',
                cell: ({ row: { original } }) => (
                  <CellLink agentId={original?.id ?? ''}>
                    <AgentStateDisplayValue state={original?.state} />
                  </CellLink>
                ),
              },
              {
                header: 'Description',
                cell: ({ row: { original } }) => (
                  <CellLink agentId={original?.id ?? ''}>
                    <Text data-testid={`agent-description-${original?.id}`}>{original?.description}</Text>
                  </CellLink>
                ),
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
        agent={agentList?.agents?.find((agent) => agent?.id === deleteAgentId)}
      />
    </>
  );
};
