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

import { createStandaloneToast } from '@redpanda-data/ui';
import { Box, Button, DataTable, Flex, SearchField } from '@redpanda-data/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { makeObservable, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import { Fragment, useState } from 'react';
import usePaginationParams from '../../../hooks/usePaginationParams';
import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  type PartitionTransformStatus,
  PartitionTransformStatus_PartitionStatus,
  type TransformMetadata,
} from '../../../protogen/redpanda/api/dataplane/v1alpha1/transform_pb';
import { appGlobal } from '../../../state/appGlobal';
import {
  type MessageSearch,
  type MessageSearchRequest,
  api,
  createMessageSearch,
  transformsApi,
} from '../../../state/backendApi';
import type { TopicMessage } from '../../../state/restInterfaces';
// import { Box, Button, DataTable, SearchField, Text } from '@redpanda-data/ui';
import { PartitionOffsetOrigin, uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/uiState';
import { sanitizeString } from '../../../utils/filterHelper';
import { DefaultSkeleton, QuickTable, TimestampDisplay } from '../../../utils/tsxUtils';
import { decodeURIComponentPercents, encodeBase64 } from '../../../utils/utils';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import Tabs from '../../misc/tabs/Tabs';
import { PageComponent, type PageInitHelper } from '../Page';
import { ExpandedMessage, MessagePreview } from '../topics/Tab.Messages';
import { PartitionStatus } from './Transforms.List';
import { openDeleteModal } from './modals';
const { ToastContainer, toast } = createStandaloneToast();

@observer
class TransformDetails extends PageComponent<{ transformName: string }> {
  @observable placeholder = 5;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

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
    if (!transformsApi.transforms) return DefaultSkeleton;
    if (transformsApi.transforms.length === 0) {
      appGlobal.history.replace('/transforms-setup');
      return null;
    }

    const transformName = decodeURIComponentPercents(this.props.transformName);
    const transform = transformsApi.transformDetails.get(transformName);
    if (!transform) return DefaultSkeleton;

    return (
      <PageContent>
        <ToastContainer />
        <Box>
          {/* <Heading as="h2">{transformName}</Heading> */}
          <Button
            variant="outline-delete"
            mt="2"
            onClick={() =>
              openDeleteModal(transformName, () => {
                transformsApi
                  .deleteTransform(transformName)
                  .then(async () => {
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

const OverviewTab = observer(
  (p: {
    transform: TransformMetadata;
  }) => {
    let overallStatus = <></>;
    if (p.transform.statuses.all((x) => x.status === PartitionTransformStatus_PartitionStatus.RUNNING))
      overallStatus = <PartitionStatus status={PartitionTransformStatus_PartitionStatus.RUNNING} />;
    else {
      // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
      const partitionTransformStatus = p.transform.statuses.first(
        (x) => x.status !== PartitionTransformStatus_PartitionStatus.RUNNING,
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
            },
          )}
        </Box>
        <Box maxWidth="35rem">
          <DataTable<PartitionTransformStatus>
            data={p.transform.statuses}
            columns={[
              { header: 'Partition', accessorKey: 'partitionId' },
              { header: 'Node', accessorKey: 'brokerId' },
              {
                header: 'Status',
                cell: ({ row: { original: r } }) => {
                  return (
                    <>
                      <PartitionStatus status={r.status} />
                    </>
                  );
                },
              },
              { header: 'Lag', accessorKey: 'lag' },
            ]}
          />
        </Box>
      </>
    );
  },
);

const LogsTab = observer(
  (p: {
    transform: TransformMetadata;
  }) => {
    const topicName = '_redpanda.transform_logs';
    const topic = api.topics?.first((x) => x.topicName === topicName);

    const createLogsTabState = () => {
      const search: MessageSearch = createMessageSearch();
      const state = observable({
        messages: search.messages,
        isComplete: false,
        error: null as string | null,
        search,
      });

      // Start search immediately
      const searchPromise = executeMessageSearch(search, topicName, p.transform.name);
      searchPromise.catch((x) => (state.error = String(x))).finally(() => (state.isComplete = true));
      return state;
    };

    const [state, setState] = useState(createLogsTabState);

    const loadLargeMessage = async (topicName: string, partitionID: number, offset: number) => {
      // Create a new search that looks for only this message specifically
      const search = createMessageSearch();
      const searchReq: MessageSearchRequest = {
        filterInterpreterCode: '',
        maxResults: 1,
        partitionId: partitionID,
        startOffset: offset,
        startTimestamp: 0,
        topicName: topicName,
        includeRawPayload: true,
        ignoreSizeLimit: true,
        keyDeserializer: PayloadEncoding.UNSPECIFIED,
        valueDeserializer: PayloadEncoding.UNSPECIFIED,
      };
      const messages = await search.startSearch(searchReq);

      if (messages && messages.length === 1) {
        // We must update the old message (that still says "payload too large")
        // So we just find its index and replace it in the array we are currently displaying
        const indexOfOldMessage = state.messages.findIndex((x) => x.partitionID === partitionID && x.offset === offset);
        if (indexOfOldMessage > -1) {
          state.messages[indexOfOldMessage] = messages[0];
        } else {
          console.error('LoadLargeMessage: cannot find old message to replace', {
            searchReq,
            messages,
          });
          throw new Error(
            'LoadLargeMessage: Cannot find old message to replace (message results must have changed since the load was started)',
          );
        }
      } else {
        console.error('LoadLargeMessage: messages response is empty', { messages });
        throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
      }
    };

    const paginationParams = usePaginationParams(10, state.messages.length);
    const messageTableColumns: ColumnDef<TopicMessage>[] = [
      {
        header: 'Timestamp',
        accessorKey: 'timestamp',
        cell: ({
          row: {
            original: { timestamp },
          },
        }) => <TimestampDisplay unixEpochMillisecond={timestamp} format="default" />,
        size: 30,
      },
      {
        header: 'Value',
        accessorKey: 'value',
        cell: ({ row: { original } }) => (
          <MessagePreview
            msg={original}
            previewFields={() => []}
            isCompactTopic={topic ? topic.cleanupPolicy.includes('compact') : false}
          />
        ),
        size: Number.MAX_SAFE_INTEGER,
      },
    ];

    const filteredMessages = state.messages.filter((x) => {
      if (!uiSettings.connectorsDetails.logsQuickSearch) return true;
      return isFilterMatch(uiSettings.connectorsDetails.logsQuickSearch, x);
    });

    return (
      <>
        <Box my="1rem">The logs below are for the last five hours.</Box>

        <Section minWidth="800px">
          <Flex mb="6">
            <SearchField
              width="230px"
              searchText={uiSettings.connectorsDetails.logsQuickSearch}
              setSearchText={(x) => (uiSettings.connectorsDetails.logsQuickSearch = x)}
            />
            <Button variant="outline" ml="auto" onClick={() => setState(createLogsTabState())}>
              Refresh logs
            </Button>
          </Flex>

          <DataTable<TopicMessage>
            data={filteredMessages}
            emptyText="No messages"
            columns={messageTableColumns}
            sorting={uiSettings.connectorsDetails.sorting ?? []}
            onSortingChange={(sorting) => {
              uiSettings.connectorsDetails.sorting =
                typeof sorting === 'function' ? sorting(uiState.topicSettings.searchParams.sorting) : sorting;
            }}
            pagination={paginationParams}
            // todo: message rendering should be extracted from TopicMessagesTab into a standalone component, in its own folder,
            //       to make it clear that it does not depend on other functinoality from TopicMessagesTab
            subComponent={({ row: { original } }) => (
              <ExpandedMessage
                msg={original}
                loadLargeMessage={() =>
                  loadLargeMessage(state.search.searchRequest?.topicName ?? '', original.partitionID, original.offset)
                }
              />
            )}
          />
        </Section>
      </>
    );
  },
);

function isFilterMatch(str: string, m: TopicMessage) {
  str = str.toLowerCase();
  if (m.offset.toString().toLowerCase().includes(str)) return true;
  if (m.keyJson?.toLowerCase().includes(str)) return true;
  if (m.valueJson?.toLowerCase().includes(str)) return true;
  return false;
}

async function executeMessageSearch(search: MessageSearch, topicName: string, transformName: string) {
  const filterCode: string = `return key == "${transformName}";`;

  const lastXHours = 5;
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - lastXHours);

  const request = {
    topicName: topicName,
    partitionId: -1,

    startOffset: PartitionOffsetOrigin.Timestamp,
    startTimestamp: startTime.getTime(),
    maxResults: 1000,
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    includeRawPayload: false,

    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
  } as MessageSearchRequest;

  // All of this should be part of "backendApi.ts", starting a message search should return an observable object,
  // so any changes in phase, messages, error, etc can be used immediately in the ui
  return runInAction(async () => {
    try {
      search.startSearch(request).catch((err) => {
        const msg = (err as Error).message ?? String(err);
        console.error(`error in transformLogsMessageSearch: ${msg}`);
        return [];
      });
    } catch (error: any) {
      console.error(`error in transformLogsMessageSearch: ${(error as Error).message ?? String(error)}`);
      return [];
    }
  });
}
