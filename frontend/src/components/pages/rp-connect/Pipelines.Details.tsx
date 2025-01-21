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

import { Alert, AlertIcon, Box, Button, DataTable, Flex, SearchField, createStandaloneToast } from '@redpanda-data/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { makeObservable, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import usePaginationParams from '../../../hooks/usePaginationParams';
import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  type Pipeline,
  type Pipeline_Resources,
  Pipeline_State,
} from '../../../protogen/redpanda/api/dataplane/v1alpha2/pipeline_pb';
import { appGlobal } from '../../../state/appGlobal';
import {
  type MessageSearch,
  type MessageSearchRequest,
  api,
  createMessageSearch,
  pipelinesApi,
} from '../../../state/backendApi';
import type { TopicMessage } from '../../../state/restInterfaces';
import { PartitionOffsetOrigin, uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/uiState';
import { sanitizeString } from '../../../utils/filterHelper';
import { DefaultSkeleton, QuickTable, TimestampDisplay } from '../../../utils/tsxUtils';
import { decodeURIComponentPercents, delay, encodeBase64 } from '../../../utils/utils';
import PageContent from '../../misc/PageContent';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import Section from '../../misc/Section';
import Tabs from '../../misc/tabs/Tabs';
import { PageComponent, type PageInitHelper } from '../Page';
import { ExpandedMessage, MessagePreview } from '../topics/Tab.Messages';
import { PipelineStatus } from './Pipelines.List';
import { openDeleteModal } from './modals';
import { cpuToTasks } from './tasks';
const { ToastContainer, toast } = createStandaloneToast();

@observer
class RpConnectPipelinesDetails extends PageComponent<{ pipelineId: string }> {
  @observable isChangingPauseState = false;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    const pipelineId = decodeURIComponentPercents(this.props.pipelineId);
    p.title = pipelineId;
    p.addBreadcrumb('Redpanda Connect', '/connect-clusters');
    p.addBreadcrumb(pipelineId, `/rp-connect/${pipelineId}`);

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(_force: boolean) {
    pipelinesApi.refreshPipelines(_force);
  }

  render() {
    if (!pipelinesApi.pipelines) return DefaultSkeleton;
    const pipelineId = decodeURIComponentPercents(this.props.pipelineId);
    const pipeline = pipelinesApi.pipelines.first((x) => x.id === pipelineId);

    if (!pipeline) return DefaultSkeleton;
    const isStopped = pipeline.state === Pipeline_State.STOPPED;
    const isTransitioningState =
      pipeline.state === Pipeline_State.STARTING || pipeline.state === Pipeline_State.STOPPING;

    const error = pipeline.status?.error;

    return (
      <PageContent>
        <ToastContainer />

        <Box my="4">
          {QuickTable(
            [
              { key: 'ID', value: pipeline.id },
              { key: 'Name', value: pipeline.displayName },
              { key: 'Description', value: pipeline.description ?? '' },
              { key: 'Status', value: <PipelineStatus status={pipeline.state} /> },
              { key: 'Resources', value: <PipelineResources resources={pipeline.resources} /> },
            ],
            { gapHeight: '.5rem', keyStyle: { fontWeight: 600 } },
          )}
        </Box>

        <Flex mb="4" gap="4">
          <Link to={`/rp-connect/${pipelineId}/edit`}>
            <Button variant="solid">Edit</Button>
          </Link>

          <Button
            variant="outline"
            isDisabled={this.isChangingPauseState || isTransitioningState}
            isLoading={this.isChangingPauseState}
            onClick={() => {
              this.isChangingPauseState = true;

              const watchPipelineUpdates = async () => {
                const waitDelays = [200, 400, 1000, 1000, 1000, 5000];
                let waitIteration = 0;

                while (true) {
                  const waitTime = waitDelays[Math.min(waitDelays.length - 1, waitIteration++)];
                  await delay(waitTime);

                  await pipelinesApi.refreshPipelines(true);
                  // if we can't find the pipeline we're checking anymore it got deleted
                  const p = pipelinesApi.pipelines?.first((x) => x.id === pipeline.id);
                  if (!p) return;

                  // if its no longer in a transition state, we're done
                  if (p.state !== Pipeline_State.STARTING && p.state !== Pipeline_State.STOPPING) return;
                }
              };

              const changePromise = isStopped
                ? pipelinesApi.startPipeline(pipeline.id)
                : pipelinesApi.stopPipeline(pipeline.id);

              changePromise
                .then(() => {
                  toast({
                    status: 'success',
                    duration: 4000,
                    isClosable: false,
                    title: `Successfully ${isStopped ? 'started' : 'stopped'} pipeline`,
                  });

                  watchPipelineUpdates();
                })
                .catch((err) => {
                  toast({
                    status: 'error',
                    duration: null,
                    isClosable: true,
                    title: `Failed to ${isStopped ? 'start' : 'stop'} pipeline`,
                    description: String(err),
                  });
                })
                .finally(() => (this.isChangingPauseState = false));
            }}
          >
            {isStopped ? 'Start' : 'Stop'}
          </Button>
          <Button
            variant="outline-delete"
            onClick={() => {
              openDeleteModal(pipeline.displayName, () => {
                pipelinesApi
                  .deletePipeline(pipeline.id)
                  .then(async () => {
                    toast({
                      status: 'success',
                      duration: 4000,
                      isClosable: false,
                      title: 'Pipeline deleted',
                    });
                    pipelinesApi.refreshPipelines(true);
                    appGlobal.history.push('/connect-clusters');
                  })
                  .catch((err) => {
                    toast({
                      status: 'error',
                      duration: null,
                      isClosable: true,
                      title: 'Failed to delete pipeline',
                      description: String(err),
                    });
                  });
              });
            }}
          >
            Delete
          </Button>
        </Flex>

        {error && (
          <Alert status="error" variant="left-accent">
            <AlertIcon />
            {error}
          </Alert>
        )}

        <Tabs
          tabs={[
            {
              key: 'config',
              title: 'Configuration',
              content: <PipelineEditor pipeline={pipeline} />,
            },
            {
              key: 'logs',
              title: 'Logs',
              content: <LogsTab pipeline={pipeline} />,
            },
          ]}
        />
      </PageContent>
    );
  }
}

export default RpConnectPipelinesDetails;

const PipelineEditor = observer(
  (p: {
    pipeline: Pipeline;
  }) => {
    const { pipeline } = p;

    return (
      <Box>
        <Flex height="400px" mt="4">
          <PipelinesYamlEditor
            defaultPath="config.yaml"
            path="config.yaml"
            value={pipeline.configYaml}
            options={{
              readOnly: true,
            }}
            language="yaml"
          />
        </Flex>
      </Box>
    );
  },
);

const LogsTab = observer(
  (p: {
    pipeline: Pipeline;
  }) => {
    const topicName = '__redpanda.connect.logs';
    const topic = api.topics?.first((x) => x.topicName === topicName);

    const createLogsTabState = () => {
      const search: MessageSearch = createMessageSearch();
      const state = observable({
        messages: search.messages,
        isComplete: false,
        error: null as string | null,
        search,
      });

      // Resume search immediately
      const searchPromise = executeMessageSearch(search, topicName, p.pipeline.id);
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
      if (!uiSettings.pipelinesDetails.logsQuickSearch) return true;
      return isFilterMatch(uiSettings.pipelinesDetails.logsQuickSearch, x);
    });

    return (
      <>
        <Box my="1rem">The logs below are for the last five hours.</Box>

        <Section minWidth="800px">
          <Flex mb="6">
            <SearchField
              width="230px"
              searchText={uiSettings.pipelinesDetails.logsQuickSearch}
              setSearchText={(x) => (uiSettings.pipelinesDetails.logsQuickSearch = x)}
            />
            <Button variant="outline" ml="auto" onClick={() => setState(createLogsTabState())}>
              Refresh logs
            </Button>
          </Flex>

          <DataTable<TopicMessage>
            data={filteredMessages}
            emptyText="No messages"
            columns={messageTableColumns}
            sorting={uiSettings.pipelinesDetails.sorting ?? []}
            onSortingChange={(sorting) => {
              uiSettings.pipelinesDetails.sorting =
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

async function executeMessageSearch(search: MessageSearch, topicName: string, pipelineId: string) {
  const filterCode: string = `return key == "${pipelineId}";`;

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
        console.error(`error in pipelineLogsMessageSearch: ${msg}`);
        return [];
      });
    } catch (error: any) {
      console.error(`error in pipelineLogsMessageSearch: ${(error as Error).message ?? String(error)}`);
      return [];
    }
  });
}

export const PipelineResources = observer((p: { resources?: Pipeline_Resources }) => {
  const r = p.resources;

  if (!r) return <>Not set</>;
  const tasks = cpuToTasks(r.cpuShares);
  return (
    <Flex gap="4">
      {tasks || '-'} Compute Units ({r.cpuShares} CPU / {r.memoryShares} Memory)
    </Flex>
  );
});
