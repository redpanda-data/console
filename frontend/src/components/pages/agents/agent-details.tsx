import {
  Box,
  Button,
  DataTable,
  Grid,
  GridItem,
  HStack,
  Heading,
  Image,
  Spinner,
  Stack,
  Text,
  VStack,
} from '@redpanda-data/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { runInAction } from 'mobx';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { transformMessageToLogEntry } from 'react-query/api/console';
import { useListMessagesStream } from 'react-query/api/hooks/useListMessagesStream';
import {
  REDPANDA_AI_AGENT_PIPELINE_PREFIX,
  useDeletePipelineMutationWithToast,
  useGetPipelineQuery,
  useStopPipelineMutationWithToast,
} from 'react-query/api/pipeline';
import { useHistory, useParams } from 'react-router-dom';
import type { TopicMessage } from 'state/restInterfaces';
import { uiState } from 'state/uiState';
import checkIcon from '../../../assets/icons/check-icon.svg';
import { AgentExpandedMessage } from './agent-expanded-message';

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = ({ agent }: { agent: Pipeline | undefined }) => {
  const nameWithoutPrefix = agent?.displayName.replace(REDPANDA_AI_AGENT_PIPELINE_PREFIX, '');
  runInAction(() => {
    uiState.pageTitle = `Agent ${nameWithoutPrefix}`;
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({
      title: `Agent ${nameWithoutPrefix}`,
      linkTo: `/agents/${agent?.id}`,
      heading: 'Agent Details',
    });
  });
};
export interface LogEntry {
  id: string;
  timestamp: string;
  key: {
    value: string;
    type: string;
    size: string;
  };
  value: {
    value: string;
    type: string;
    size: string;
    fullData?: unknown;
  };
  isExpanded?: boolean;
}

// Define the Agent Status component
const AgentStatus = ({ isRunning }: { isRunning: boolean }) => (
  <HStack spacing={2}>
    <Box>
      <Image src={checkIcon} alt="Status" width="16px" height="16px" />
    </Box>
    <Text>{isRunning ? 'Running' : 'Stopped'}</Text>
  </HStack>
);

export const AgentDetailsPage = () => {
  const { agentId } = useParams<{ agentId: Pipeline['id'] }>();
  const { mutateAsync: stopPipeline, isPending: isStopPipelinePending } = useStopPipelineMutationWithToast();
  const { mutateAsync: deletePipeline, isPending: isDeletePipelinePending } = useDeletePipelineMutationWithToast();

  const { data: agentData } = useGetPipelineQuery({ id: agentId });
  const history = useHistory();

  const { searchForPipeline } = useListMessagesStream();

  const [logsData, setLogsData] = useState<TopicMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Define constants for logs fetching
  const REDPANDA_CONNECT_LOGS_TOPIC = '__redpanda.connect.logs';
  const MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT = 1000;
  const REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS = 5;

  // Directly use the searchForPipeline function
  const fetchLogs = useCallback(async () => {
    if (!agentId || !searchForPipeline) return;

    try {
      setIsLoading(true);
      setError(null);
      const result = await searchForPipeline(REDPANDA_CONNECT_LOGS_TOPIC, agentId, {
        timeWindowHours: REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS,
        maxResults: MAX_REDPANDA_CONNECT_LOGS_RESULT_COUNT,
      });
      setLogsData(result || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
      console.error('Error fetching logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [agentId, searchForPipeline]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    console.log('fetching logs');
    fetchLogs();

    // Set up periodic refresh
    const intervalId = setInterval(() => {
      fetchLogs();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(intervalId);
  }, [fetchLogs]);

  useEffect(() => {
    updatePageTitle({ agent: agentData?.response?.pipeline });
  }, [agentData?.response?.pipeline]);

  const pipeline = agentData?.response?.pipeline;
  const isAgentRunning = pipeline?.state === Pipeline_State.RUNNING;
  const nameWithoutPrefix = pipeline?.displayName?.replace(REDPANDA_AI_AGENT_PIPELINE_PREFIX, '') ?? 'Agent';

  // Transform raw logs data into the format expected by the DataTable
  const formattedLogsData = useMemo<LogEntry[]>(() => {
    return logsData.map(transformMessageToLogEntry);
  }, [logsData]);

  // Table columns definition
  const logsTableColumns = useMemo<ColumnDef<LogEntry>[]>(
    () => [
      {
        header: 'Timestamp',
        accessorKey: 'timestamp',
        cell: ({ row }) => row.original.timestamp,
        size: 175,
      },
      {
        header: 'Key',
        accessorKey: 'key',
        cell: ({ row }) => (
          <VStack align="flex-start" spacing={0}>
            <Text color="#101828">{row.original.key.value}</Text>
            <Text color="#475467" fontSize="sm">{`${row.original.key.type} - ${row.original.key.size}`}</Text>
          </VStack>
        ),
        size: 328,
      },
      {
        header: 'Value',
        accessorKey: 'value',
        cell: ({ row }) => (
          <VStack align="flex-start" spacing={0}>
            <Text color="#101828" isTruncated maxWidth="calc(100% - 20px)">
              {row.original.value.value}
            </Text>
            <Text color="#475467" fontSize="sm">{`${row.original.value.type} - ${row.original.value.size}`}</Text>
          </VStack>
        ),
        size: 500,
      },
    ],
    [],
  );

  return (
    <Stack spacing={8}>
      <Box>
        <Grid templateColumns="auto 1fr" gap={5} mb={5}>
          <GridItem>
            <VStack align="flex-start" spacing={2}>
              <Text fontWeight="semibold">ID</Text>
              <Text fontWeight="semibold">Name</Text>
              <Text fontWeight="semibold">Role</Text>
              <Text fontWeight="semibold">Description</Text>
              <Text fontWeight="semibold">Status</Text>
            </VStack>
          </GridItem>
          <GridItem>
            <VStack align="flex-start" spacing={2}>
              <Text>{pipeline?.id}</Text>
              <Text>{nameWithoutPrefix}</Text>
              <Text>Agent</Text>
              <Text>{pipeline?.description}</Text>
              <AgentStatus isRunning={isAgentRunning} />
            </VStack>
          </GridItem>
        </Grid>

        {/* Action Buttons */}
        <HStack spacing={3} mb={6}>
          {isAgentRunning && (
            <Button
              variant="outline"
              colorScheme="red"
              borderColor="#E2E8F0"
              onClick={async () => {
                if (agentId) {
                  await stopPipeline({
                    request: { id: agentId },
                  });
                }
              }}
              isLoading={isStopPipelinePending}
              loadingText="Stopping"
              aria-label="Stop Agent"
            >
              Stop
            </Button>
          )}
          <Button
            variant="outline"
            colorScheme="red"
            borderColor="#FECACA"
            color="#DC2626"
            onClick={async () => {
              if (agentId) {
                await deletePipeline({
                  request: { id: agentId },
                });
                history.push('/agents');
              }
            }}
            isLoading={isDeletePipelinePending}
            loadingText="Deleting"
            aria-label="Delete Agent"
          >
            Delete
          </Button>
        </HStack>

        {/* Logs Section */}
        <Box mb={10}>
          <HStack justifyContent="space-between" alignItems="center" mb={3}>
            <Heading as="h3" size="md">
              Logs
            </Heading>
          </HStack>
          <Box borderWidth="1px" borderColor="#EAECF0" borderRadius="md" overflow="hidden" bg="white">
            {isLoading ? (
              <Box display="flex" justifyContent="center" alignItems="center" p={8}>
                <Spinner size="md" />
                <Text ml={2}>Loading logs...</Text>
              </Box>
            ) : error ? (
              <Box p={6} textAlign="center">
                <Text color="#DC2626">Error loading logs: {error}</Text>
                <Button mt={4} size="sm" onClick={fetchLogs} colorScheme="blue" aria-label="Retry fetching logs">
                  Retry
                </Button>
              </Box>
            ) : logsData.length === 0 ? (
              <Box p={6} textAlign="center">
                <Text color="#475467">No log entries found for this agent.</Text>
              </Box>
            ) : (
              <DataTable<LogEntry>
                data={formattedLogsData}
                columns={logsTableColumns}
                subComponent={({ row: { original } }) => <AgentExpandedMessage msg={original} />}
              />
            )}
          </Box>
        </Box>
      </Box>
    </Stack>
  );
};
