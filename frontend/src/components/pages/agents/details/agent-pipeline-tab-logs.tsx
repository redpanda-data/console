import { Box, Button, DataTable, Flex, SearchField, Stack, Text } from '@redpanda-data/ui';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { ExpandedMessage, MessagePreview } from 'components/pages/topics/Tab.Messages';
import { observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useState } from 'react';
import { REDPANDA_CONNECT_LOGS_TOPIC } from 'react-query/api/pipeline';
import type { MessageSearch, MessageSearchRequest } from 'state/backendApi';
import { createMessageSearch } from 'state/backendApi';
import type { TopicMessage } from 'state/restInterfaces';
import { uiState } from 'state/uiState';
import { sanitizeString } from 'utils/filterHelper';
import { TimestampDisplay } from 'utils/tsxUtils';
import { encodeBase64 } from 'utils/utils';

// Default sorting configuration - sort by timestamp in descending order
const DEFAULT_SORTING: SortingState = [
  {
    id: 'timestamp',
    desc: true,
  },
];

const isFilterMatch = (filter: string, message: TopicMessage): boolean => {
  if (!filter) return true;

  const str = filter.toLowerCase();
  if (message.offset.toString().toLowerCase().includes(str)) return true;
  if (message.keyJson?.toLowerCase().includes(str)) return true;
  if (message.valueJson?.toLowerCase().includes(str)) return true;

  return false;
};

async function executeMessageSearch(search: MessageSearch, topicName: string, agentId: string) {
  const filterCode = `return key == "${agentId}";`;

  const lastXHours = 5;
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - lastXHours);

  const request: MessageSearchRequest = {
    topicName,
    partitionId: -1,

    startOffset: -2, // Timestamp
    startTimestamp: startTime.getTime(),
    maxResults: 1000,
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    includeRawPayload: false,

    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
  };

  // Start the search with the configured parameters
  return runInAction(async () => {
    try {
      await search.startSearch(request).catch((err) => {
        const msg = (err as Error).message ?? String(err);
        console.error(`error in agentLogsMessageSearch: ${msg}`);
        return [];
      });
    } catch (error: unknown) {
      console.error(`error in agentLogsMessageSearch: ${(error as Error).message ?? String(error)}`);
      return [];
    }
  });
}

interface AgentPipelineTabLogsProps {
  pipeline?: Pipeline;
}

/**
 * This component is separated from others because it is using MobX. We need to stream the pipeline logs to have better UX.
 * The existing implementation is tighly coupled with how state is managed in Console UI today.
 * In the future, this should be refactored to use useStream, ideally with a custom hook for react-query.
 * @see https://github.com/connectrpc/connect-query-es/issues/225#issuecomment-1852256622
 * @see https://github.com/valorem-labs-inc/react-hooks/blob/main/src/hooks/useStream.ts
 * for inspiration
 */
export const AgentPipelineTabLogs = observer(({ pipeline }: AgentPipelineTabLogsProps) => {
  // Add logging UI settings to the uiState if it doesn't exist
  if (!('agentDetails' in uiState)) {
    runInAction(() => {
      (uiState as any).agentDetails = observable({
        logsQuickSearch: '',
        sorting: DEFAULT_SORTING,
      });
    });
  }

  const createLogsTabState = () => {
    const search: MessageSearch = createMessageSearch();
    const state = observable({
      messages: search.messages,
      isComplete: false,
      error: null as string | null,
      search,
    });

    // Start search immediately if agent ID is available
    if (pipeline?.id) {
      const searchPromise = executeMessageSearch(search, REDPANDA_CONNECT_LOGS_TOPIC, pipeline.id);
      searchPromise.catch((x) => (state.error = String(x))).finally(() => (state.isComplete = true));
    }

    return state;
  };

  const [state, setState] = useState(createLogsTabState);

  const messageTableColumns: ColumnDef<TopicMessage>[] = [
    {
      header: 'Timestamp',
      accessorKey: 'timestamp',
      cell: ({
        row: {
          original: { timestamp },
        },
      }) => <TimestampDisplay unixEpochMillisecond={timestamp} format="default" />,
      size: 200,
    },
    {
      header: 'Value',
      accessorKey: 'value',
      cell: ({ row: { original } }) => (
        <MessagePreview msg={original} previewFields={() => []} isCompactTopic={false} />
      ),
      size: Number.MAX_SAFE_INTEGER,
    },
  ];

  const filteredMessages = state.messages.filter((x) => {
    if (!(uiState as any).agentDetails.logsQuickSearch) return true;
    return isFilterMatch((uiState as any).agentDetails.logsQuickSearch, x);
  });

  return (
    <Stack spacing={1}>
      <Text fontSize="lg" fontWeight="medium" mb={4}>
        Logs
      </Text>

      <Flex mb="6">
        <SearchField
          width="230px"
          searchText={(uiState as any).agentDetails.logsQuickSearch}
          setSearchText={(x) => {
            runInAction(() => {
              (uiState as any).agentDetails.logsQuickSearch = x;
            });
          }}
          placeholderText="Filter logs..."
        />
        <Button variant="outline" ml="auto" onClick={() => setState(createLogsTabState())}>
          Refresh logs
        </Button>
      </Flex>

      <Box>
        {state.error ? (
          <Text color="red.500">Error loading logs: {state.error}</Text>
        ) : (
          <DataTable<TopicMessage>
            data={filteredMessages}
            emptyText="No messages"
            columns={messageTableColumns}
            sorting={(uiState as any).agentDetails.sorting ?? []}
            isLoading={!state.isComplete}
            loadingText="Loading... This can take several seconds."
            onSortingChange={(sorting) => {
              runInAction(() => {
                (uiState as any).agentDetails.sorting =
                  typeof sorting === 'function' ? sorting((uiState as any).agentDetails.sorting) : sorting;
              });
            }}
            subComponent={({ row: { original } }) => (
              <ExpandedMessage
                msg={original}
                loadLargeMessage={
                  () => Promise.resolve() // No need to load large messages for this view
                }
              />
            )}
          />
        )}
      </Box>
    </Stack>
  );
});
