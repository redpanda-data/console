/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { DataTable } from '@redpanda-data/ui';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { ExpandedMessage, MessagePreview } from 'components/pages/topics/Tab.Messages';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Input } from 'components/redpanda-ui/components/input';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Text } from 'components/redpanda-ui/components/typography';
import { Logs, RefreshCcw } from 'lucide-react';
import { observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import { PayloadEncoding } from 'protogen/redpanda/api/console/v1alpha1/common_pb';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { MessageSearch, MessageSearchRequest } from 'state/backend-api';
import { createMessageSearch } from 'state/backend-api';
import type { TopicMessage } from 'state/rest-interfaces';
import { uiState } from 'state/ui-state';
import { sanitizeString } from 'utils/filter-helper';
import { TimestampDisplay } from 'utils/tsx-utils';
import { encodeBase64 } from 'utils/utils';

export const REMOTE_MCP_LOGS_TOPIC = '__redpanda.connect.logs';

// Default sorting configuration - sort by timestamp in descending order
const DEFAULT_SORTING: SortingState = [
  {
    id: 'timestamp',
    desc: true,
  },
];

const isFilterMatch = (filter: string, message: TopicMessage): boolean => {
  if (!filter) {
    return true;
  }

  const str = filter.toLowerCase();
  if (message.offset.toString().toLowerCase().includes(str)) {
    return true;
  }
  if (message.keyJson?.toLowerCase().includes(str)) {
    return true;
  }
  if (message.valueJson?.toLowerCase().includes(str)) {
    return true;
  }

  return false;
};

function executeMessageSearch(search: MessageSearch, topicName: string, remoteMcpId: string) {
  const filterCode = `return key == "${remoteMcpId}";`;

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
  return runInAction(() => {
    try {
      return search.startSearch(request).catch((err) => {
        const msg = (err as Error).message ?? String(err);
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(`error in remoteMcpLogsMessageSearch: ${msg}`);
        return [];
      });
    } catch (error: unknown) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`error in remoteMcpLogsMessageSearch: ${(error as Error).message ?? String(error)}`);
      return Promise.resolve([]);
    }
  });
}

/**
 * This component is separated from others because it is using MobX. We need to stream the remote MCP logs to have better UX.
 * The existing implementation is tightly coupled with how state is managed in Console UI today.
 * In the future, this should be refactored to use useStream, ideally with a custom hook for react-query.
 */
export const RemoteMCPLogsTab = observer(() => {
  const { id } = useParams<{ id: string }>();

  // Initialize default sorting if not set
  if (uiState.remoteMcpDetails.sorting.length === 0) {
    runInAction(() => {
      uiState.remoteMcpDetails.sorting = DEFAULT_SORTING;
    });
  }

  const createLogsTabState = () => {
    const messageSearch: MessageSearch = createMessageSearch();
    const tabState = observable({
      messages: messageSearch.messages,
      isComplete: false,
      error: null as string | null,
      search: messageSearch,
    });

    // Start search immediately if remote MCP ID is available
    if (id) {
      const searchPromise = executeMessageSearch(messageSearch, REMOTE_MCP_LOGS_TOPIC, id);
      searchPromise.catch((x) => {
        tabState.error = String(x);
        tabState.isComplete = true;
      });
    }

    return tabState;
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
      }) => <TimestampDisplay format="default" unixEpochMillisecond={timestamp} />,
      size: 200,
    },
    {
      header: 'Value',
      accessorKey: 'value',
      cell: ({ row: { original } }) => (
        <MessagePreview isCompactTopic={false} msg={original} previewFields={() => []} />
      ),
      size: Number.MAX_SAFE_INTEGER,
    },
  ];

  const filteredMessages = state.messages.filter((x) => {
    if (!uiState.remoteMcpDetails.logsQuickSearch) {
      return true;
    }
    return isFilterMatch(uiState.remoteMcpDetails.logsQuickSearch, x);
  });

  return (
    <Card className="px-0 py-0" size="full">
      <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2">
          <Logs className="h-4 w-4" />
          <Text className="font-semibold">Server Logs</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col gap-2">
          <Text variant="muted">Real-time logs from the MCP server.</Text>

          <div className="mb-6 flex items-center gap-4">
            <Input
              className="w-60"
              onChange={(e) => {
                runInAction(() => {
                  uiState.remoteMcpDetails.logsQuickSearch = e.target.value;
                });
              }}
              placeholder="Filter logs..."
              value={uiState.remoteMcpDetails.logsQuickSearch}
            />
            <Button className="ml-auto" onClick={() => setState(createLogsTabState())} variant="outline">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4" />
                Refresh logs
              </div>
            </Button>
          </div>
        </div>

        <div>
          {(() => {
            if (state.error) {
              return <Text className="text-destructive">Error loading logs: {state.error}</Text>;
            }
            if (!state.isComplete && state.messages.length === 0) {
              return (
                <div className="flex flex-col space-y-3">
                  <Skeleton className="h-[125px] w-full rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              );
            }
            return (
              <DataTable<TopicMessage>
                columns={messageTableColumns}
                data={filteredMessages}
                emptyText="No messages"
                isLoading={!state.isComplete}
                loadingText="Loading... This can take several seconds."
                onSortingChange={(sorting) => {
                  runInAction(() => {
                    uiState.remoteMcpDetails.sorting =
                      typeof sorting === 'function' ? sorting(uiState.remoteMcpDetails.sorting) : sorting;
                  });
                }}
                sorting={uiState.remoteMcpDetails.sorting ?? []}
                subComponent={({ row: { original } }) => (
                  <ExpandedMessage
                    loadLargeMessage={
                      () => Promise.resolve() // No need to load large messages for this view
                    }
                    msg={original}
                  />
                )}
              />
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
});
