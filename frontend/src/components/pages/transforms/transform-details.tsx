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

'use no memo';

import { Box, Button, createStandaloneToast, DataTable, Flex, SearchField } from '@redpanda-data/ui';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Fragment, useEffect, useRef, useState } from 'react';

import { openDeleteModal } from './modals';
import { PartitionStatus } from './transforms-list';
import usePaginationParams from '../../../hooks/use-pagination-params';
import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  type PartitionTransformStatus,
  PartitionTransformStatus_PartitionStatus,
  type TransformMetadata,
} from '../../../protogen/redpanda/api/dataplane/v1/transform_pb';
import { useTopicsQuery } from '../../../react-query/api/topic';
import { appGlobal } from '../../../state/app-global';
import {
  createMessageSearch,
  type MessageSearch,
  type MessageSearchRequest,
  transformsApi,
} from '../../../state/backend-api';
import type { TopicMessage } from '../../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../../state/ui';
import { sanitizeString } from '../../../utils/filter-helper';
import { DefaultSkeleton, QuickTable, TimestampDisplay } from '../../../utils/tsx-utils';
import { decodeURIComponentPercents, encodeBase64 } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import Tabs from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper } from '../page';
import { ExpandedMessage } from '../topics/Tab.Messages/message-display/expanded-message';
import { MessagePreview } from '../topics/Tab.Messages/message-display/message-preview';

const { ToastContainer, toast } = createStandaloneToast();

class TransformDetails extends PageComponent<{ transformName: string }> {
  initPage(p: PageInitHelper): void {
    const transformName = decodeURIComponentPercents(this.props.transformName);
    p.title = transformName;
    p.addBreadcrumb('Transforms', '/transforms');
    p.addBreadcrumb(transformName, `/transforms/${transformName}`, undefined, {
      canBeCopied: true,
      canBeTruncated: true,
    });

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    transformsApi.refreshTransforms(force);
  }

  render() {
    if (!transformsApi.transforms) {
      return DefaultSkeleton;
    }
    if (transformsApi.transforms.length === 0) {
      appGlobal.historyReplace('/transforms-setup');
      return null;
    }

    const transformName = decodeURIComponentPercents(this.props.transformName);
    const transform = transformsApi.transformDetails.get(transformName);
    if (!transform) {
      return DefaultSkeleton;
    }

    return (
      <PageContent>
        <ToastContainer />
        <Box>
          {/* <Heading as="h2">{transformName}</Heading> */}
          <Button
            mt="2"
            onClick={() =>
              openDeleteModal(transformName, () => {
                transformsApi
                  .deleteTransform(transformName)
                  .then(() => {
                    toast({
                      status: 'success',
                      duration: 4000,
                      isClosable: false,
                      title: 'Transform deleted',
                    });
                    transformsApi.refreshTransforms(true);
                  })
                  .catch((err) => {
                    toast({
                      status: 'error',
                      duration: null,
                      isClosable: true,
                      title: 'Failed to delete transform',
                      description: String(err),
                    });
                  });
              })
            }
            variant="outline-delete"
          >
            Delete
          </Button>
        </Box>

        <Tabs
          tabs={[
            { key: 'overview', title: <>Overview</>, content: <OverviewTab transform={transform} /> },
            { key: 'logs', title: <>Logs</>, content: <LogsTab transform={transform} /> },
          ]}
        />
      </PageContent>
    );
  }
}
export default TransformDetails;

const OverviewTab = (p: { transform: TransformMetadata }) => {
  let overallStatus = <></>;
  if (p.transform.statuses.all((x) => x.status === PartitionTransformStatus_PartitionStatus.RUNNING)) {
    overallStatus = <PartitionStatus status={PartitionTransformStatus_PartitionStatus.RUNNING} />;
  } else {
    // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
    const partitionTransformStatus = p.transform.statuses.first(
      (x) => x.status !== PartitionTransformStatus_PartitionStatus.RUNNING
    )!;
    overallStatus = <PartitionStatus status={partitionTransformStatus.status} />;
  }

  return (
    <>
      <Box my="6">
        {QuickTable(
          [
            { key: 'Status', value: overallStatus },
            { key: 'Input topic', value: p.transform.inputTopicName },
            {
              key: 'Output topics',
              value: (
                <>
                  {p.transform.outputTopicNames
                    .map((x) => <Fragment key={x}>{x}</Fragment>)
                    .genericJoin(() => (
                      <br />
                    ))}
                </>
              ),
            },
            // { key: '', value: p.transform.environmentVariables }
          ],
          {
            keyStyle: { fontWeight: 600, verticalAlign: 'baseline' },
            keyAlign: 'left',
            gapHeight: '.5rem',
            gapWidth: '4rem',
          }
        )}
      </Box>
      <Box maxWidth="35rem">
        <DataTable<PartitionTransformStatus>
          columns={[
            { header: 'Partition', accessorKey: 'partitionId' },
            { header: 'Node', accessorKey: 'brokerId' },
            {
              header: 'Status',
              cell: ({ row: { original: r } }) => <PartitionStatus status={r.status} />,
            },
            { header: 'Lag', accessorKey: 'lag' },
          ]}
          data={p.transform.statuses}
        />
      </Box>
    </>
  );
};

const LogsTab = (p: { transform: TransformMetadata }) => {
  const topicName = '_redpanda.transform_logs';
  const { data: topicsData } = useTopicsQuery();
  const topic = topicsData?.topics?.first((x) => x.topicName === topicName);

  const [logState, setLogState] = useState<{ messages: TopicMessage[]; isComplete: boolean }>({
    messages: [],
    isComplete: false,
  });
  const { messages, isComplete } = logState;
  const [logsQuickSearch, setLogsQuickSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const searchRef = useRef<MessageSearch | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    searchRef.current?.stopSearch();
    const search = createMessageSearch();
    searchRef.current = search;
    queueMicrotask(() => setLogState({ messages: [], isComplete: false }));
    executeMessageSearch(search, topicName, p.transform.name).finally(() => {
      setLogState({ messages: [...search.messages], isComplete: true });
    });
    return () => {
      search.stopSearch();
    };
  }, [refreshCount]);

  useEffect(() => {
    const interval = setInterval(() => {
      const search = searchRef.current;
      if (search) {
        setLogState((prev) => ({ ...prev, messages: [...search.messages] }));
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const loadLargeMessage = async (msgTopicName: string, partitionID: number, offset: number) => {
    const search = createMessageSearch();
    const searchReq: MessageSearchRequest = {
      filterInterpreterCode: '',
      maxResults: 1,
      partitionId: partitionID,
      startOffset: offset,
      startTimestamp: 0,
      topicName: msgTopicName,
      includeRawPayload: true,
      ignoreSizeLimit: true,
      keyDeserializer: PayloadEncoding.UNSPECIFIED,
      valueDeserializer: PayloadEncoding.UNSPECIFIED,
    };
    const loadedMessages = await search.startSearch(searchReq);

    if (loadedMessages && loadedMessages.length === 1) {
      setLogState((prev) => {
        const idx = prev.messages.findIndex((x) => x.partitionID === partitionID && x.offset === offset);
        if (idx === -1) return prev;
        const updated = [...prev.messages];
        updated[idx] = loadedMessages[0];
        return { ...prev, messages: updated };
      });
    } else {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('LoadLargeMessage: messages response is empty', { loadedMessages });
      throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
    }
  };

  const paginationParams = usePaginationParams(messages.length, 10);
  const messageTableColumns: ColumnDef<TopicMessage>[] = [
    {
      header: 'Timestamp',
      accessorKey: 'timestamp',
      cell: ({
        row: {
          original: { timestamp },
        },
      }) => <TimestampDisplay format="default" unixEpochMillisecond={timestamp} />,
      size: 30,
    },
    {
      header: 'Value',
      accessorKey: 'value',
      cell: ({ row: { original } }) => (
        <MessagePreview
          isCompactTopic={topic ? topic.cleanupPolicy.includes('compact') : false}
          msg={original}
          previewFields={() => []}
        />
      ),
      size: Number.MAX_SAFE_INTEGER,
    },
  ];

  const filteredMessages = messages.filter((x) => {
    if (!logsQuickSearch) {
      return true;
    }
    return isFilterMatch(logsQuickSearch, x);
  });

  return (
    <>
      <Box my="1rem">The logs below are for the last five hours.</Box>

      <Section minWidth="800px">
        <Flex mb="6">
          <SearchField searchText={logsQuickSearch} setSearchText={setLogsQuickSearch} width="230px" />
          <Button ml="auto" onClick={() => setRefreshCount((c) => c + 1)} variant="outline">
            Refresh logs
          </Button>
        </Flex>

        <DataTable<TopicMessage>
          columns={messageTableColumns}
          data={filteredMessages}
          emptyText="No messages"
          isLoading={!isComplete && messages.length === 0}
          onSortingChange={setSorting}
          pagination={paginationParams}
          sorting={sorting}
          // todo: message rendering should be extracted from TopicMessagesTab into a standalone component, in its own folder,
          //       to make it clear that it does not depend on other functinoality from TopicMessagesTab
          subComponent={({ row: { original } }) => (
            <ExpandedMessage
              loadLargeMessage={() =>
                loadLargeMessage(
                  searchRef.current?.searchRequest?.topicName ?? '',
                  original.partitionID,
                  original.offset
                )
              }
              msg={original}
            />
          )}
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

function executeMessageSearch(search: MessageSearch, topicName: string, transformName: string) {
  const filterCode: string = `return key == "${transformName}";`;

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
    return search.startSearch(request).catch((err) => {
      const msg = (err as Error).message ?? String(err);
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`error in transformLogsMessageSearch: ${msg}`);
      return [];
    });
  } catch (error: unknown) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`error in transformLogsMessageSearch: ${(error as Error).message ?? String(error)}`);
    return Promise.resolve([]);
  }
}
