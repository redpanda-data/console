import 'components/legacy-layout.css';
/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { api, createMessageSearch, type MessageSearch, type MessageSearchRequest } from '../../../state/backend-api';
import type { ConnectClusterStore } from '../../../state/connect/state';
import type { Topic, TopicMessage } from '../../../state/rest-interfaces';
import type { ClusterConnectorInfo } from '../../../types/kafka-connect';
import { TimestampDisplay } from '../../../utils/tsx-utils';
import { SearchInput } from '../../misc/search-input';
import './helper';
import { ChevronDownIcon, ChevronRightIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';

import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { PartitionOffsetOrigin } from '../../../types/topic-settings';
import { sanitizeString } from '../../../utils/filter-helper';
import { isPresent } from '../../../utils/type-guards';
import { encodeBase64 } from '../../../utils/utils';
import { Section } from '../../misc/section';
import { ExpandedMessage } from '../topics/Tab.Messages/message-display/expanded-message';
import { MessagePreview } from '../topics/Tab.Messages/message-display/message-preview';

// Stable identity keeps an expanded row on its message when the list is filtered or refreshed.
const LOGS_TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  getRowId: (message: TopicMessage) => `${message.partitionID}-${message.offset}`,
};

export const LOGS_TOPIC_NAME = '__redpanda.connectors_logs';
type ConnectorLogs = {
  messages: TopicMessage[];
  isComplete: boolean;
  loadLargeMessage: (partitionID: number, offset: number) => Promise<void>;
  refresh: () => void;
};
type ConnectorLogState = {
  messages: TopicMessage[];
  isComplete: boolean;
};
const EMPTY_CONNECTOR_LOGS: ConnectorLogState = { messages: [], isComplete: false };

// Stops the running log search and starts a fresh one for `connectorName`.
function restartConnectorLogSearch(
  searchRef: React.RefObject<MessageSearch | null>,
  connectorName: string,
  setLogState: React.Dispatch<React.SetStateAction<ConnectorLogState>>
) {
  searchRef.current?.stopSearch();
  const search = createMessageSearch();
  searchRef.current = search;
  executeMessageSearch(search, LOGS_TOPIC_NAME, connectorName)
    .catch((error: unknown) => {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('error loading connector logs', error);
    })
    .finally(() => {
      setLogState({ messages: [...search.messages], isComplete: true });
    });
}

// Streams the connector's log messages from the logs topic, restarting for another connector or on refresh.
function useConnectorLogs(connectorName: string): ConnectorLogs {
  const [logState, setLogState] = useState<ConnectorLogState>(EMPTY_CONNECTOR_LOGS);
  const searchRef = useRef<MessageSearch | null>(null);

  useEffect(() => {
    queueMicrotask(() => setLogState(EMPTY_CONNECTOR_LOGS));
    restartConnectorLogSearch(searchRef, connectorName, setLogState);
    return () => {
      // `refresh` may have replaced the search this run started, so stop whichever is current.
      searchRef.current?.stopSearch();
    };
  }, [connectorName]);

  useEffect(() => {
    const interval = setInterval(() => {
      const search = searchRef.current;
      if (search) {
        setLogState((prev) => ({ ...prev, messages: [...search.messages] }));
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const loadLargeMessage = async (partitionID: number, offset: number) => {
    const search = createMessageSearch();
    const searchReq: MessageSearchRequest = {
      filterInterpreterCode: '',
      maxResults: 1,
      partitionId: partitionID,
      startOffset: offset,
      startTimestamp: 0,
      topicName: searchRef.current?.searchRequest?.topicName ?? LOGS_TOPIC_NAME,
      includeRawPayload: true,
      ignoreSizeLimit: true,
      keyDeserializer: PayloadEncoding.UNSPECIFIED,
      valueDeserializer: PayloadEncoding.UNSPECIFIED,
    };
    const result = await search.startSearch(searchReq);

    if (isPresent(result) && result.length === 1) {
      setLogState((prev) => {
        const updated = [...prev.messages];
        const idx = updated.findIndex((x) => x.partitionID === partitionID && x.offset === offset);
        if (idx > -1) {
          updated[idx] = result[0];
        }
        return { ...prev, messages: updated };
      });
    } else {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('LoadLargeMessage: messages response is empty', { result });
      throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
    }
  };

  return {
    messages: logState.messages,
    isComplete: logState.isComplete,
    loadLargeMessage,
    refresh: () => {
      setLogState(EMPTY_CONNECTOR_LOGS);
      restartConnectorLogSearch(searchRef, connectorName, setLogState);
    },
  };
}

function useLogMessageColumns(topic: Topic | undefined): DataTableColumnDef<TopicMessage>[] {
  // Memoised: a new columns array per render makes the table re-create every header and cell, which
  // this tab would do every 200 ms while logs stream (the sort menu could never stay open).
  return useMemo(
    () => [
      // The Registry DataTable renders no expander column for `subComponent`.
      {
        id: 'expander',
        enableSorting: false,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              aria-expanded={row.getIsExpanded()}
              aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
              onClick={row.getToggleExpandedHandler()}
              size="icon-xs"
              variant="ghost"
            >
              {row.getIsExpanded() ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            </Button>
          ) : null,
      },
      {
        id: 'timestamp',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Timestamp" />,
        accessorKey: 'timestamp',
        cell: ({
          row: {
            original: { timestamp },
          },
        }) => (
          <span className="whitespace-nowrap">
            <TimestampDisplay format="default" unixEpochMillisecond={timestamp} />
          </span>
        ),
      },
      {
        id: 'value',
        header: 'Value',
        accessorKey: 'value',
        // A decoded preview; sorting the raw value means nothing.
        enableSorting: false,
        // The Registry DataTable ignores column sizes; a viewport-wide max-content hands this column the slack.
        cell: ({ row: { original } }) => (
          <div className="w-screen max-w-full">
            <MessagePreview
              isCompactTopic={topic ? topic.cleanupPolicy.includes('compact') : false}
              msg={original}
              previewFields={() => []}
            />
          </div>
        ),
      },
    ],
    [topic]
  );
}

export const LogsTab = (p: {
  clusterName: string;
  connectClusterStore: ConnectClusterStore;
  connector: ClusterConnectorInfo;
}) => {
  const topic = api.topics?.find((x) => x.topicName === LOGS_TOPIC_NAME);
  const { messages, isComplete, loadLargeMessage, refresh } = useConnectorLogs(p.connector.name);
  const [logsQuickSearch, setLogsQuickSearch] = useState('');
  const messageTableColumns = useLogMessageColumns(topic);

  const filteredMessages = messages.filter((x) => {
    if (!logsQuickSearch) {
      return true;
    }
    return isFilterMatch(logsQuickSearch, x);
  });

  return (
    <>
      <div className="my-4">The logs below are for the last three hours.</div>

      <Section className="min-w-[800px]">
        <div className="mb-6 flex">
          <SearchInput
            containerClassName="w-[230px]"
            onChange={setLogsQuickSearch}
            placeholder="Search..."
            value={logsQuickSearch}
          />
          <div className="ml-auto">
            <Button onClick={refresh} variant="outline">
              Refresh logs
            </Button>
          </div>
        </div>

        <DataTable<TopicMessage>
          columns={messageTableColumns}
          data={filteredMessages}
          emptyText="No messages"
          isLoading={!isComplete}
          pagination={filteredMessages.length > 0}
          subComponent={({ row: { original } }) => (
            <ExpandedMessage
              loadLargeMessage={() => loadLargeMessage(original.partitionID, original.offset)}
              msg={original}
            />
          )}
          tableOptions={LOGS_TABLE_OPTIONS}
        />
      </Section>
    </>
  );
};

function isFilterMatch(str: string, m: TopicMessage) {
  const lowerStr = str.toLowerCase();
  if (m.offset.toString().toLowerCase().includes(lowerStr)) {
    return true;
  }
  if (m.keyJson?.toLowerCase().includes(lowerStr)) {
    return true;
  }
  if (m.valueJson?.toLowerCase().includes(lowerStr)) {
    return true;
  }
  return false;
}

function executeMessageSearch(search: MessageSearch, topicName: string, connectorKey: string) {
  const filterCode: string = `return key == "${connectorKey}";`;

  const lastXHours = 5;
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - lastXHours);

  const request = {
    topicName,
    partitionId: -1,

    startOffset: PartitionOffsetOrigin.Timestamp,
    startTimestamp: startTime.getTime(),
    maxResults: 1000,
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    includeRawPayload: false,

    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
  } as MessageSearchRequest;

  try {
    return search.startSearch(request).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`error in connectorLogsMessageSearch: ${msg}`);
      return [];
    });
  } catch (error: unknown) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`error in connectorLogsMessageSearch: ${error instanceof Error ? error.message : String(error)}`);
    return Promise.resolve([]);
  }
}
