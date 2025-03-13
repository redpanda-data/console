import {
  Box,
  Button,
  ButtonGroup,
  DataTable,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
} from '@redpanda-data/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { runInAction } from 'mobx';
import {
  DeletePipelineRequest,
  type Pipeline,
  Pipeline_State,
} from 'protogen/redpanda/api/dataplane/v1alpha2/pipeline_pb';
import { useEffect, useMemo, useState } from 'react';
import { HiX } from 'react-icons/hi';
import { IoMdTrash } from 'react-icons/io';
import { MdCheck, MdOutlineQuestionMark, MdRefresh, MdSearch, MdStop } from 'react-icons/md';
import {
  REDPANDA_AI_AGENT_PIPELINE_PREFIX,
  useDeletePipelineMutationWithToast,
  useListPipelinesAndAgentsQuery,
} from 'react-query/api/pipeline';
import { Link, useHistory } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { encodeURIComponentPercents } from 'utils/utils';

export const PipelineStateDisplayValue = ({ state }: { state: Pipeline_State }) => {
  switch (state) {
    case Pipeline_State.UNSPECIFIED:
      return (
        <HStack spacing={2}>
          <HiX color="orange" />
          <Text>Unspecified</Text>
        </HStack>
      );
    case Pipeline_State.STARTING:
      return (
        <HStack spacing={2}>
          <MdRefresh color="#444" />
          <Text>Starting</Text>
        </HStack>
      );
    case Pipeline_State.RUNNING:
      return (
        <HStack spacing={2}>
          <MdCheck color="green" />
          <Text>Running</Text>
        </HStack>
      );
    case Pipeline_State.COMPLETED:
      return (
        <HStack spacing={2}>
          <MdCheck color="green" />
          <Text>Completed</Text>
        </HStack>
      );
    case Pipeline_State.STOPPING:
      return (
        <HStack spacing={2}>
          <MdRefresh color="#444" />
          <Text>Stopping</Text>
        </HStack>
      );
    case Pipeline_State.STOPPED:
      return (
        <HStack spacing={2}>
          <MdStop color="#444" />
          <Text>Stopped</Text>
        </HStack>
      );
    case Pipeline_State.ERROR:
      return (
        <HStack spacing={2}>
          <HiX color="red" />
          <Text>Error</Text>
        </HStack>
      );
    default:
      return (
        <HStack spacing={2}>
          <MdOutlineQuestionMark color="red" /> Unknown
        </HStack>
      );
  }
};

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Agents';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'Agents', linkTo: '/agents', heading: 'Agents' });
  });
};

export const AgentListPage = () => {
  // Only run once
  useEffect(() => {
    updatePageTitle();
  }, []);

  // Use react-router-dom v5 history object because we don't want to touch MobX state
  const history = useHistory();

  const [searchText, setSearchText] = useState('');

  const { data: pipelineAndAgentList } = useListPipelinesAndAgentsQuery();
  const { mutate: deleteAgent } = useDeletePipelineMutationWithToast();
  const [agentToDelete, setAgentToDelete] = useState<Pipeline | null>(null);

  // Filter knowledge base items based on filter text and status
  const filteredData = useMemo(() => {
    return (
      pipelineAndAgentList?.agents?.filter((agent) => {
        const nameMatch = agent?.displayName.toLowerCase().includes(searchText.toLowerCase());
        return nameMatch;
      }) ?? []
    );
  }, [pipelineAndAgentList?.agents, searchText]);

  // Define table columns
  const columns = useMemo<ColumnDef<Pipeline | undefined>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessorFn: (row) => row?.displayName ?? '',
        cell: (info) => {
          const pipeline = info.row.original;
          if (!pipeline) return null;
          return (
            <Link to={`/agents/${encodeURIComponentPercents(pipeline.id)}`}>
              <Text wordBreak="break-word" whiteSpace="break-spaces">
                {pipeline.displayName.replace(REDPANDA_AI_AGENT_PIPELINE_PREFIX, '')}
              </Text>
            </Link>
          );
        },
        size: Number.POSITIVE_INFINITY, // Hack to make whole row clickable
      },
      {
        id: 'description',
        header: 'Description',
        accessorFn: (row) => row?.description ?? '',
        cell: (info) => info.row.original?.description,
        size: 100,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (row) => row?.state ?? Pipeline_State.UNSPECIFIED,
        cell: (info) => (info.row.original ? <PipelineStateDisplayValue state={info.row.original.state} /> : null),
      },
      {
        header: '',
        id: 'actions',
        accessorFn: (row) => row?.id ?? '',
        cell: (info) => {
          const pipeline = info.row.original;
          if (!pipeline) return null;
          return (
            <Button
              variant="icon"
              height="16px"
              color="gray.500"
              onClick={async (e) => {
                e.stopPropagation();
                e.preventDefault();

                setAgentToDelete(pipeline);
              }}
            >
              <IoMdTrash />
            </Button>
          );
        },
        size: 1,
      },
    ],
    [],
  );

  return (
    <Box>
      <Box mb="8">
        <Text>Manage your AI agents.</Text>
      </Box>

      <Box mb="4">
        <Flex justifyContent="space-between" mb="4" flexWrap="wrap" gap="3">
          <Flex gap="4" alignItems="center" flexWrap={{ base: 'wrap', md: 'nowrap' }}>
            <InputGroup maxW="300px">
              <InputLeftElement pointerEvents="none">
                <MdSearch color="gray.300" />
              </InputLeftElement>
              <Input
                placeholder="Search by name..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-label="Search by name"
              />
            </InputGroup>
          </Flex>

          <Button
            aria-label="Create new Agent"
            onClick={() => {
              history.push('/agents/create');
            }}
          >
            Create new Agent
          </Button>
        </Flex>

        <DataTable columns={columns} data={filteredData} emptyText="No agents found" />
        {agentToDelete && (
          <Modal isOpen={!!agentToDelete} onClose={() => setAgentToDelete(null)}>
            <ModalOverlay />
            <ModalContent>
              <ModalHeader>Delete Agent</ModalHeader>
              <ModalBody>
                <Text>Are you sure you want to delete this agent?</Text>
              </ModalBody>
              <ModalFooter>
                <ButtonGroup>
                  <Button variant="outline" onClick={() => setAgentToDelete(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await deleteAgent({ request: new DeletePipelineRequest({ id: agentToDelete.id }) });
                      setAgentToDelete(null);
                    }}
                  >
                    Delete
                  </Button>
                </ButtonGroup>
              </ModalFooter>
            </ModalContent>
          </Modal>
        )}
      </Box>
    </Box>
  );
};
