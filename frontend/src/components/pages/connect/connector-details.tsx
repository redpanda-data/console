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

import { comparer, observable, transaction } from 'mobx';
import { observer, useLocalObservable } from 'mobx-react';
import React, { useEffect, useState } from 'react';

import { ConfigPage } from './dynamic-ui/components';
import { appGlobal } from '../../../state/app-global';
import { api, createMessageSearch, type MessageSearch, type MessageSearchRequest } from '../../../state/backend-api';
import { ConnectClusterStore } from '../../../state/connect/state';
import {
  type ClusterConnectorInfo,
  type ClusterConnectorTaskInfo,
  type ConnectorError,
  DataType,
  PropertyImportance,
  type TopicMessage,
} from '../../../state/rest-interfaces';
import { Code, TimestampDisplay } from '../../../utils/tsx-utils';
import { PageComponent, type PageInitHelper } from '../page';
import './helper';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  CodeBlock,
  DataTable,
  Flex,
  Grid,
  Heading,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Modal as RPModal,
  SearchField,
  Skeleton,
  Tabs,
  Text,
  Tooltip,
  useDisclosure,
} from '@redpanda-data/ui';
import type { ColumnDef } from '@tanstack/react-table';

import { getConnectorFriendlyName } from './connector-box-card';
import { ConfirmModal, NotConfigured, statusColors, TaskState } from './helper';
import usePaginationParams from '../../../hooks/use-pagination-params';
import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { PartitionOffsetOrigin, uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/ui-state';
import { sanitizeString } from '../../../utils/filter-helper';
import { delay, encodeBase64, titleCase } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { ExpandedMessage } from '../topics/Tab.Messages/message-display/expanded-message';
import { MessagePreview } from '../topics/Tab.Messages/message-display/message-preview';

const LOGS_TOPIC_NAME = '__redpanda.connectors_logs';

export type UpdatingConnectorData = { clusterName: string; connectorName: string };
export type RestartingTaskData = { clusterName: string; connectorName: string; taskId: number };
type LocalConnectorState = {
  pausingConnector: ClusterConnectorInfo | null;
  restartingConnector: ClusterConnectorInfo | null;
  updatingConnector: UpdatingConnectorData | null;
  restartingTask: RestartingTaskData | null;
  deletingConnector: string | null;
};
const KafkaConnectorMain = observer(
  ({
    clusterName,
    connectorName,
    refreshData,
  }: {
    clusterName: string;
    connectorName: string;
    refreshData: (force: boolean) => Promise<void>;
  }) => {
    const [connectClusterStore] = useState(ConnectClusterStore.getInstance(clusterName));

    const logsTopic = api.topics?.first((x) => x.topicName === LOGS_TOPIC_NAME);

    useEffect(() => {
      const init = async () => {
        await connectClusterStore.setup();
      };
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      init().catch(console.error);
    }, [connectClusterStore]);

    const $state = useLocalObservable<LocalConnectorState>(() => ({
      pausingConnector: null,
      restartingConnector: null,
      updatingConnector: null,
      restartingTask: null,
      deletingConnector: null,
    }));
    if (!connectClusterStore.isInitialized) {
      return <Skeleton height={4} mt={5} noOfLines={20} />;
    }

    const connectorStore = connectClusterStore.getConnectorStore(connectorName);

    const connector = connectClusterStore.getRemoteConnector(connectorName);

    const canEdit = connectClusterStore.canEdit;
    if (!connector) {
      return null;
    }

    return (
      <>
        {/* [Pause] [Restart] [Delete] */}
        <Flex alignItems="center" flexDirection="row" gap="3">
          {/* [Pause/Resume] */}
          {connectClusterStore.validateConnectorState(connectorName, ['RUNNING', 'PAUSED']) ? (
            <Tooltip
              hasArrow={true}
              isDisabled={canEdit === true}
              label={"You don't have 'canEditConnectCluster' permissions for this connect cluster"}
              placement="top"
            >
              <Button
                isDisabled={!canEdit}
                minWidth="32"
                onClick={() => ($state.pausingConnector = connector)}
                variant="outline"
              >
                {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Pause' : 'Resume'}
              </Button>
            </Tooltip>
          ) : null}

          {/* [Restart] */}
          <Tooltip
            hasArrow={true}
            isDisabled={canEdit === true}
            label={"You don't have 'canEditConnectCluster' permissions for this connect cluster"}
            placement="top"
          >
            <Button
              isDisabled={!canEdit}
              minWidth="32"
              onClick={() => ($state.restartingConnector = connector)}
              variant="outline"
            >
              Restart
            </Button>
          </Tooltip>

          {/* [Delete] */}
          <Tooltip
            hasArrow={true}
            isDisabled={canEdit === true}
            label={"You don't have 'canEditConnectCluster' permissions for this connect cluster"}
            placement="top"
          >
            <Button
              colorScheme="red"
              isDisabled={!canEdit}
              minWidth="32"
              onClick={() => ($state.deletingConnector = connectorName)}
              variant="outline"
            >
              Delete
            </Button>
          </Tooltip>
        </Flex>

        <Tabs
          items={[
            {
              key: 'overview',
              name: 'Overview',
              component: (
                <Box mt="8">
                  <ConfigOverviewTab
                    clusterName={clusterName}
                    connectClusterStore={connectClusterStore}
                    connector={connector}
                  />
                </Box>
              ),
            },
            {
              key: 'configuration',
              name: 'Configuration',
              component: (
                <Box mt="8">
                  <Box maxWidth="800px">
                    {Boolean(connectorStore) && (
                      // biome-ignore lint/style/noNonNullAssertion: checked above with Boolean(connectorStore)
                      <ConfigPage connectorStore={connectorStore!} context="EDIT" />
                    )}
                  </Box>

                  {/* Update Config Button */}
                  <Flex m={4} mb={6}>
                    <Tooltip
                      hasArrow={true}
                      isDisabled={canEdit === true}
                      label={"You don't have 'canEditConnectCluster' permissions for this connect cluster"}
                      placement="top"
                    >
                      <Button
                        isDisabled={(() => {
                          if (!canEdit) {
                            return true;
                          }
                          if (!connector) {
                            return true;
                          }
                          const connectorConfigObject = connectorStore?.getConfigObject();
                          if (connectorConfigObject && comparer.shallow(connector.config, connectorConfigObject)) {
                            return true;
                          }
                        })()}
                        onClick={() => {
                          $state.updatingConnector = { clusterName, connectorName };
                        }}
                        style={{ width: '200px' }}
                        variant="outline"
                      >
                        Update Config
                      </Button>
                    </Tooltip>
                  </Flex>
                </Box>
              ),
            },
            {
              key: 'logs',
              name: 'Logs',
              isDisabled: logsTopic ? false : `Logs topic '${LOGS_TOPIC_NAME}' does not exist.`,
              component: (
                <Box mt="8">
                  <LogsTab clusterName={clusterName} connectClusterStore={connectClusterStore} connector={connector} />
                </Box>
              ),
            },
          ]}
          marginBlock="2"
          size="lg"
        />

        {/* Pause/Resume Modal */}
        <ConfirmModal<ClusterConnectorInfo>
          clearTarget={() => ($state.pausingConnector = null)}
          content={(c) => (
            <>
              {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Pause' : 'Resume'} connector{' '}
              <strong>{c.name}</strong>?
            </>
          )}
          onOk={async (c) => {
            if (connectClusterStore.validateConnectorState(connectorName, ['RUNNING'])) {
              await api.pauseConnector(clusterName, c.name);
            } else {
              await api.resumeConnector(clusterName, c.name);
            }
            await delay(500);
            await refreshData(true);
          }}
          successMessage={(c) => (
            <>
              {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Resumed' : 'Paused'} connector{' '}
              <strong>{c.name}</strong>
            </>
          )}
          target={() => $state.pausingConnector}
        />

        {/* Restart */}
        <ConfirmModal<ClusterConnectorInfo>
          clearTarget={() => ($state.restartingConnector = null)}
          content={(c) => (
            <>
              Restart connector <strong>{c.name}</strong>?
            </>
          )}
          onOk={async (c) => {
            await api.restartConnector(clusterName, c.name);
            await refreshData(true);
          }}
          successMessage={(c) => (
            <>
              Successfully restarted connector <strong>{c.name}</strong>
            </>
          )}
          target={() => $state.restartingConnector}
        />

        {/* Update Config */}
        <ConfirmModal<UpdatingConnectorData>
          clearTarget={() => ($state.updatingConnector = null)}
          content={(c) => (
            <>
              Update configuration of connector <strong>{c.connectorName}</strong>?
            </>
          )}
          onOk={async (c) => {
            connectClusterStore.getConnectorStore(c.connectorName);
            await connectClusterStore.updateConnnector(c.connectorName);
            appGlobal.historyPush(`/connect-clusters/${encodeURIComponent(clusterName)}`);
            await refreshData(true);
          }}
          successMessage={(c) => (
            <>
              Successfully updated config of <strong>{c.connectorName}</strong>
            </>
          )}
          target={() => $state.updatingConnector}
        />

        {/* Restart Task */}
        <ConfirmModal<RestartingTaskData>
          clearTarget={() => ($state.restartingTask = null)}
          content={(c) => (
            <>
              Restart task <strong>{c.taskId}</strong> of <strong>{c.connectorName}</strong>?
            </>
          )}
          onOk={async (c) => {
            await api.restartTask(c.clusterName, c.connectorName, c.taskId);
            await refreshData(true);
          }}
          successMessage={(c) => (
            <>
              Successfully restarted <strong>{c.taskId}</strong> of <strong>{c.connectorName}</strong>
            </>
          )}
          target={() => $state.restartingTask}
        />

        {/* Delete Connector */}
        <ConfirmModal<string>
          clearTarget={() => ($state.deletingConnector = null)}
          content={(c) => (
            <>
              Delete connector <strong>{c}</strong>?
            </>
          )}
          onOk={async (_connectorName) => {
            await connectClusterStore.deleteConnector(connectorName);
            await refreshData(true);
            appGlobal.historyPush(`/connect-clusters/${encodeURIComponent(clusterName)}`);
          }}
          successMessage={(c) => (
            <>
              Deleted connector <strong>{c}</strong>
            </>
          )}
          target={() => $state.deletingConnector}
        />
      </>
    );
  }
);

const ConfigOverviewTab = observer(
  (p: { clusterName: string; connectClusterStore: ConnectClusterStore; connector: ClusterConnectorInfo }) => {
    const { connectClusterStore, connector } = p;
    const connectorName = connector.name;

    return (
      <Grid
        alignItems="start"
        gap="6"
        gridTemplateRows="auto"
        templateAreas={`
                "errors errors"
                "health details"
                "tasks details"
            `}
      >
        <Flex flexDirection="column" gap="2" gridArea="errors">
          {connector.errors.map((e) => (
            <ConnectorErrorModal error={e} key={e.title} />
          ))}
        </Flex>

        <Section gridArea="health">
          <Flex flexDirection="row" gap="4" m="1">
            <Box background={statusColors[connector.status]} borderRadius="3px" width="5px" />

            <Flex flexDirection="column">
              <Text fontSize="3xl" fontWeight="semibold">
                {titleCase(connector.status)}
              </Text>
              <Text opacity=".5">Status</Text>
            </Flex>
          </Flex>
        </Section>

        <Section gridArea="tasks" minWidth="500px" py={4}>
          <Flex alignItems="center" gap="2" mb="6" mt="2">
            <Heading as="h3" color="blackAlpha.800" fontSize="1rem" fontWeight="semibold" textTransform="uppercase">
              Tasks
            </Heading>
            <Text fontWeight="normal" opacity=".5">
              ({connectClusterStore.getConnectorTasks(connectorName)?.length || 0})
            </Text>
          </Flex>
          <DataTable<ClusterConnectorTaskInfo>
            columns={[
              {
                header: 'Task',
                accessorKey: 'taskId',
                size: 200,
                cell: ({
                  row: {
                    original: { taskId },
                  },
                }) => <Code nowrap>Task-{taskId}</Code>,
              },
              {
                header: 'Status',
                accessorKey: 'state',
                cell: ({ row: { original } }) => <TaskState observable={original} />,
              },
              {
                header: 'Worker',
                accessorKey: 'workerId',
                cell: ({ row: { original } }) => <Code nowrap>{original.workerId}</Code>,
              },
            ]}
            data={connectClusterStore.getConnectorTasks(connectorName) ?? []}
            defaultPageSize={10}
            pagination
            sorting
          />
        </Section>

        <Section gridArea="details" py={4}>
          <Heading
            as="h3"
            color="blackAlpha.800"
            fontSize="1rem"
            fontWeight="semibold"
            mb="6"
            mt="2"
            textTransform="uppercase"
          >
            Connector Details
          </Heading>

          <ConnectorDetails
            clusterName={p.clusterName}
            connectClusterStore={connectClusterStore}
            connector={connector}
          />
        </Section>
      </Grid>
    );
  }
);

const ConnectorErrorModal = observer((p: { error: ConnectorError }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const errorType = p.error.type === 'ERROR' ? 'error' : 'warning';

  const hasConnectorLogs = api.topics?.any((x) => x.topicName === LOGS_TOPIC_NAME);

  return (
    <>
      <Alert borderRadius="8px" height="12" onClick={onOpen} status={errorType} variant="solid">
        <AlertIcon />
        <Box whiteSpace="break-spaces" wordBreak="break-all">
          {p.error.title}
        </Box>
        <Button colorScheme="gray" ml="auto" mt="1px" size="sm" variant="ghost">
          View details
        </Button>
      </Alert>

      <RPModal isOpen={isOpen} onClose={onClose} size="6xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{p.error.title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <CodeBlock codeString={p.error.content} language="json" showScroll={false} />
          </ModalBody>
          <ModalFooter gap={2}>
            {Boolean(hasConnectorLogs) && (
              <Button mr="auto" onClick={() => appGlobal.historyPush(`/topics/${LOGS_TOPIC_NAME}`)}>
                Show Logs
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </RPModal>
    </>
  );
});

@observer
class KafkaConnectorDetails extends PageComponent<{ clusterName: string; connector: string }> {
  initPage(p: PageInitHelper): void {
    const clusterName = decodeURIComponent(this.props.clusterName);
    const connector = decodeURIComponent(this.props.connector);
    p.title = connector;
    p.addBreadcrumb('Connectors', '/connect-clusters');
    p.addBreadcrumb(clusterName, `/connect-clusters/${encodeURIComponent(clusterName)}`, 'Cluster Name');
    p.addBreadcrumb(
      connector,
      `/connect-clusters/${encodeURIComponent(clusterName)}/${encodeURIComponent(connector)}`,
      undefined,
      {
        canBeTruncated: true,
        canBeCopied: true,
      }
    );
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    this.refreshData(true).catch(console.error);
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    appGlobal.onRefresh = () => this.refreshData(true).catch(console.error);
  }

  async refreshData(force: boolean): Promise<void> {
    ConnectClusterStore.connectClusters.clear();
    await api.refreshConnectClusters();

    // refresh topics so we know whether or not we can show the "go to error logs topic" button in the connector details error popup
    // and show the logs tab
    api.refreshTopics(force);
  }

  render() {
    const clusterName = decodeURIComponent(this.props.clusterName);
    const connectorName = decodeURIComponent(this.props.connector);

    if (api.connectConnectors?.isConfigured === false) {
      return <NotConfigured />;
    }

    return (
      <PageContent>
        <KafkaConnectorMain clusterName={clusterName} connectorName={connectorName} refreshData={this.refreshData} />
      </PageContent>
    );
  }
}

export default KafkaConnectorDetails;

const ConnectorDetails = observer(
  (p: { clusterName: string; connectClusterStore: ConnectClusterStore; connector: ClusterConnectorInfo }) => {
    const store = p.connectClusterStore.getConnectorStore(p.connector.name);

    const allProps = [...(store?.propsByName.values() ?? [])];

    const items = allProps
      .filter((x) => {
        if (x.isHidden) {
          return false;
        }
        if (x.entry.definition.type === DataType.Password) {
          return false;
        }
        if (x.entry.definition.importance !== PropertyImportance.High) {
          return false;
        }

        if (!x.value) {
          return false;
        }
        if (x.name === 'name') {
          return false;
        }

        return true;
      })
      .orderBy((x) => {
        let i = 0;
        for (const s of store?.connectorStepDefinitions ?? []) {
          for (const g of s.groups) {
            for (const configKey of g.config_keys) {
              if (configKey === x.name) {
                return i;
              }
              i += 1;
            }
          }
        }

        return 0;
      });

    const displayEntries = items.map((e) => {
      const r = {
        name: e.entry.definition.display_name,
        value: String(e.value),
      };

      // Try to undo mapping
      if (e.entry.metadata.recommended_values?.length) {
        const match = e.entry.metadata.recommended_values.find((x) => x.value === e.value);
        if (match) {
          r.value = String(match.display_name);
        }
      }

      return r;
    });

    displayEntries.unshift({
      name: 'Type',
      value: `${p.connector.type === 'source' ? 'Import from' : 'Export to'} ${getConnectorFriendlyName(p.connector.class)}`,
    });

    return (
      <Grid columnGap="10" rowGap="3" templateColumns="auto 1fr">
        {displayEntries.map((x) => (
          <React.Fragment key={x.name}>
            <Text fontWeight="semibold" whiteSpace="nowrap">
              {x.name}
            </Text>
            <Text overflow="hidden" textOverflow="ellipsis" title={x.value} whiteSpace="nowrap">
              {x.value}
            </Text>
          </React.Fragment>
        ))}
      </Grid>
    );
  }
);

const LogsTab = observer(
  (p: { clusterName: string; connectClusterStore: ConnectClusterStore; connector: ClusterConnectorInfo }) => {
    const { connector } = p;
    const connectorName = connector.name;
    const topicName = LOGS_TOPIC_NAME;
    const topic = api.topics?.first((x) => x.topicName === topicName);

    const createLogsTabState = () => {
      const search: MessageSearch = createMessageSearch();
      const tabState = observable({
        messages: search.messages,
        isComplete: false,
        error: null as string | null,
        search,
      });

      // Start search immediately
      const searchPromise = executeMessageSearch(search, topicName, connectorName);
      searchPromise.catch((x) => (tabState.error = String(x))).finally(() => (tabState.isComplete = true));
      return tabState;
    };

    const [state, setState] = useState(createLogsTabState);

    const loadLargeMessage = async (msgTopicName: string, partitionID: number, offset: number) => {
      // Create a new search that looks for only this message specifically
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
        keyDeserializer: uiState.topicSettings.searchParams.keyDeserializer,
        valueDeserializer: uiState.topicSettings.searchParams.valueDeserializer,
      };
      const messages = await search.startSearch(searchReq);

      if (messages && messages.length === 1) {
        // We must update the old message (that still says "payload too large")
        // So we just find its index and replace it in the array we are currently displaying
        const indexOfOldMessage = state.messages.findIndex((x) => x.partitionID === partitionID && x.offset === offset);
        if (indexOfOldMessage > -1) {
          state.messages[indexOfOldMessage] = messages[0];
        } else {
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error('LoadLargeMessage: cannot find old message to replace', {
            searchReq,
            messages,
          });
          throw new Error(
            'LoadLargeMessage: Cannot find old message to replace (message results must have changed since the load was started)'
          );
        }
      } else {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('LoadLargeMessage: messages response is empty', { messages });
        throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
      }
    };

    const paginationParams = usePaginationParams(state.messages.length, 10);
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

    const filteredMessages = state.messages.filter((x) => {
      if (!uiSettings.connectorsDetails.logsQuickSearch) {
        return true;
      }
      return isFilterMatch(uiSettings.connectorsDetails.logsQuickSearch, x);
    });

    return (
      <>
        <Box my="1rem">The logs below are for the last three hours.</Box>

        <Section minWidth="800px">
          <Flex mb="6">
            <SearchField
              searchText={uiSettings.connectorsDetails.logsQuickSearch}
              setSearchText={(x) => (uiSettings.connectorsDetails.logsQuickSearch = x)}
              width="230px"
            />
            <Button ml="auto" onClick={() => setState(createLogsTabState())} variant="outline">
              Refresh logs
            </Button>
          </Flex>

          <DataTable<TopicMessage>
            columns={messageTableColumns}
            data={filteredMessages}
            emptyText="No messages"
            onSortingChange={(sorting) => {
              uiSettings.connectorsDetails.sorting =
                typeof sorting === 'function' ? sorting(uiState.topicSettings.searchParams.sorting) : sorting;
            }}
            pagination={paginationParams}
            sorting={uiSettings.connectorsDetails.sorting ?? []}
            subComponent={({ row: { original } }) => (
              <ExpandedMessage
                loadLargeMessage={() =>
                  loadLargeMessage(state.search.searchRequest?.topicName ?? '', original.partitionID, original.offset)
                }
                msg={original}
              />
            )}
          />
        </Section>
      </>
    );
  }
);

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

  // All of this should be part of "backendApi.ts", starting a message search should return an observable object,
  // so any changes in phase, messages, error, etc can be used immediately in the ui
  return transaction(() => {
    try {
      return search.startSearch(request).catch((err) => {
        const msg = (err as Error).message ?? String(err);
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(`error in connectorLogsMessageSearch: ${msg}`);
        return [];
      });
    } catch (error: unknown) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`error in connectorLogsMessageSearch: ${(error as Error).message ?? String(error)}`);
      return Promise.resolve([]);
    }
  });
}
