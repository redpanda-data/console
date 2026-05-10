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

import { ConnectError } from '@connectrpc/connect';
import { Alert, AlertIcon, Box, Button, createStandaloneToast, DataTable, Flex, SearchField } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Button as RegistryButton } from 'components/redpanda-ui/components/button';
import { isEmbedded, isFeatureFlagEnabled } from 'config';
import { RefreshCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { openDeleteModal } from './modals';
import PipelinePage from './pipeline';
import { PipelineStatus } from './pipelines-list';
import { cpuToTasks } from './tasks';
import usePaginationParams from '../../../hooks/use-pagination-params';
import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  type Pipeline,
  type Pipeline_Resources,
  Pipeline_State,
} from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { appGlobal } from '../../../state/app-global';
import {
  api,
  createMessageSearch,
  type MessageSearch,
  type MessageSearchRequest,
  pipelinesApi,
} from '../../../state/backend-api';
import type { TopicMessage } from '../../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../../state/ui';
import { sanitizeString } from '../../../utils/filter-helper';
import { isFilterMatch } from '../../../utils/message-table-helpers';
import { DefaultSkeleton, QuickTable, TimestampDisplay } from '../../../utils/tsx-utils';
import { decodeURIComponentPercents, delay, encodeBase64 } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import PipelinesYamlEditor from '../../misc/pipelines-yaml-editor';
import Section from '../../misc/section';
import Tabs from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper } from '../page';
import { ExpandedMessage } from '../topics/Tab.Messages/message-display/expanded-message';
import { MessagePreview } from '../topics/Tab.Messages/message-display/message-preview';

const { ToastContainer, toast } = createStandaloneToast();

class RpConnectPipelinesDetails extends PageComponent<{ pipelineId: string }> {
  initPage(p: PageInitHelper): void {
    const pipelineId = decodeURIComponentPercents(this.props.pipelineId);
    const pipeline = pipelinesApi.pipelines?.first((x) => x.id === pipelineId);
    p.title = pipeline?.displayName ?? pipelineId;
    p.addBreadcrumb('Redpanda Connect', '/connect-clusters');
    p.addBreadcrumb(pipelineId, `/rp-connect/${pipelineId}`);

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(_force: boolean) {
    pipelinesApi.refreshPipelines(_force);
  }

  render() {
    if (isFeatureFlagEnabled('enableRpcnTiles') && isEmbedded()) {
      return <PipelinePage />;
    }

    if (!pipelinesApi.pipelines) {
      return DefaultSkeleton;
    }
    const pipelineId = decodeURIComponentPercents(this.props.pipelineId);
    const pipeline = pipelinesApi.pipelines.first((x) => x.id === pipelineId);

    if (!pipeline) {
      return DefaultSkeleton;
    }

    return <RpConnectPipelinesDetailsContent pipeline={pipeline} pipelineId={pipelineId} />;
  }
}

export default RpConnectPipelinesDetails;

const RpConnectPipelinesDetailsContent = ({ pipeline, pipelineId }: { pipeline: Pipeline; pipelineId: string }) => {
  const [isChangingPauseState, setIsChangingPauseState] = useState(false);

  const isStopped = pipeline.state === Pipeline_State.STOPPED;
  const isTransitioningState = pipeline.state === Pipeline_State.STARTING || pipeline.state === Pipeline_State.STOPPING;

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
            ...(pipeline.url ? [{ key: 'URL', value: pipeline.url }] : []),
          ],
          { gapHeight: '.5rem', keyStyle: { fontWeight: 600 } }
        )}
      </Box>

      <Flex gap="4" mb="4">
        <Link params={{ pipelineId }} to="/rp-connect/$pipelineId/edit">
          <Button variant="solid">Edit</Button>
        </Link>

        <Button
          isDisabled={isChangingPauseState || isTransitioningState}
          isLoading={isChangingPauseState}
          onClick={() => {
            setIsChangingPauseState(true);

            const watchPipelineUpdates = async () => {
              const waitDelays = [200, 400, 1000, 1000, 1000, 5000];
              let waitIteration = 0;

              while (true) {
                const waitTime = waitDelays[Math.min(waitDelays.length - 1, waitIteration)];
                waitIteration += 1;
                await delay(waitTime);

                await pipelinesApi.refreshPipelines(true);
                // if we can't find the pipeline we're checking anymore it got deleted
                const p = pipelinesApi.pipelines?.first((x) => x.id === pipeline.id);
                if (!p) {
                  return;
                }

                // if its no longer in a transition state, we're done
                if (p.state !== Pipeline_State.STARTING && p.state !== Pipeline_State.STOPPING) {
                  return;
                }
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
                  title: `Pipeline ${isStopped ? 'started' : 'stopped'}`,
                });

                // biome-ignore lint/suspicious/noConsole: error logging for unhandled promise rejections
                watchPipelineUpdates().catch(console.error);
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
              .finally(() => {
                setIsChangingPauseState(false);
              });
          }}
          variant="outline"
        >
          {isStopped ? 'Start' : 'Stop'}
        </Button>
        <Button
          onClick={() => {
            openDeleteModal(pipeline.displayName, () => {
              pipelinesApi
                .deletePipeline(pipeline.id)
                .then(() => {
                  toast({
                    status: 'success',
                    duration: 4000,
                    isClosable: false,
                    title: 'Pipeline deleted',
                  });
                  pipelinesApi.refreshPipelines(true);
                  appGlobal.historyPush('/connect-clusters');
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
          variant="outline-delete"
        >
          Delete
        </Button>
      </Flex>

      {Boolean(error) && (
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
};

const PipelineEditor = (p: { pipeline: Pipeline }) => {
  const { pipeline } = p;

  return (
    <Box>
      <Flex height="400px" mt="4">
        <PipelinesYamlEditor
          defaultPath="config.yaml"
          language="yaml"
          options={{
            readOnly: true,
          }}
          path="config.yaml"
          value={pipeline.configYaml}
        />
      </Flex>
    </Box>
  );
};

export const LogsTab = ({ pipeline, variant = 'card' }: { pipeline: Pipeline; variant?: 'ghost' | 'card' }) => {
  const topicName = '__redpanda.connect.logs';
  const topic = api.topics?.first((x) => x.topicName === topicName);

  const [logState, setLogState] = useState<{ messages: TopicMessage[]; isComplete: boolean }>({
    messages: [],
    isComplete: false,
  });
  const { messages, isComplete } = logState;
  const [logsQuickSearch, setLogsQuickSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const searchRef = useRef<MessageSearch | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional to force message search to re-run when pipeline.id and refreshCount changes
  useEffect(() => {
    searchRef.current?.stopSearch();
    const search = createMessageSearch();
    searchRef.current = search;
    queueMicrotask(() => setLogState({ messages: [], isComplete: false }));
    executeMessageSearch(search, topicName, pipeline.id).finally(() => {
      setLogState({ messages: [...search.messages], isComplete: true });
    });
    return () => {
      search.stopSearch();
    };
  }, [refreshCount, pipeline.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      const search = searchRef.current;
      if (search) {
        setLogState((prev) => {
          if (prev.messages.length === search.messages.length) {
            return prev;
          }
          return { ...prev, messages: [...search.messages] };
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const loadLargeMessage = useCallback(async (msgTopicName: string, partitionID: number, offset: number) => {
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
        if (idx === -1) {
          return prev;
        }
        const updated = [...prev.messages];
        updated[idx] = loadedMessages[0];
        return { ...prev, messages: updated };
      });
    } else {
      throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
    }
  }, []);

  const paginationParams = usePaginationParams(messages.length, 10);
  const isCompactTopic = topic ? topic.cleanupPolicy.includes('compact') : false;
  const messageTableColumns: ColumnDef<TopicMessage>[] = useMemo(
    () => [
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
          <MessagePreview isCompactTopic={isCompactTopic} msg={original} previewFields={() => []} />
        ),
        size: Number.MAX_SAFE_INTEGER,
      },
    ],
    [isCompactTopic]
  );

  const renderSubComponent = useCallback(
    ({ row: { original } }: { row: { original: TopicMessage } }) => (
      <ExpandedMessage
        loadLargeMessage={() =>
          loadLargeMessage(searchRef.current?.searchRequest?.topicName ?? '', original.partitionID, original.offset)
        }
        msg={original}
      />
    ),
    [loadLargeMessage]
  );

  const filteredMessages = useMemo(
    () =>
      messages.filter((x) => {
        if (!logsQuickSearch) {
          return true;
        }
        return isFilterMatch(logsQuickSearch, x);
      }),
    [messages, logsQuickSearch]
  );

  return (
    <>
      <Box my="1rem">The logs below are for the last five hours.</Box>

      <Section borderColor={variant === 'ghost' ? 'transparent' : undefined} minWidth="800px" overflowY="auto">
        <div className="mb-6 flex items-center justify-between gap-2">
          <SearchField searchText={logsQuickSearch} setSearchText={setLogsQuickSearch} width="230px" />
          <RegistryButton onClick={() => setRefreshCount((c) => c + 1)} size="icon" variant="ghost">
            <RefreshCcw />
          </RegistryButton>
        </div>

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
          subComponent={renderSubComponent}
        />
      </Section>
    </>
  );
};

function executeMessageSearch(search: MessageSearch, topicName: string, pipelineId: string) {
  const filterCode: string = `return key == "${pipelineId}";`;

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
    return search.startSearch(request);
  } catch (error) {
    const connectError = ConnectError.from(error);
    sonnerToast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'search', entity: 'pipeline logs' }));
    return Promise.resolve([]);
  }
}

export const PipelineResources = (p: { resources?: Pipeline_Resources }) => {
  const r = p.resources;

  if (!r) {
    return 'Not set';
  }
  const tasks = cpuToTasks(r.cpuShares);
  return (
    <Flex gap="4">
      {tasks || '-'} Compute Units ({r.cpuShares} CPU / {r.memoryShares} Memory)
    </Flex>
  );
};
