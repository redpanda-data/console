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
import { appGlobal } from '../../../state/appGlobal';
import { type MessageSearch, type MessageSearchRequest, api, createMessageSearch } from '../../../state/backendApi';
import { ConnectClusterStore } from '../../../state/connect/state';
import {
  type ClusterConnectorInfo,
  type ClusterConnectorTaskInfo,
  type ConnectorError,
  DataType,
  PropertyImportance,
  type TopicMessage,
} from '../../../state/restInterfaces';
import { Code, TimestampDisplay } from '../../../utils/tsxUtils';
import { PageComponent, type PageInitHelper } from '../Page';
import { ConfigPage } from './dynamic-ui/components';
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
import usePaginationParams from '../../../hooks/usePaginationParams';
import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { PartitionOffsetOrigin, uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/uiState';
import { sanitizeString } from '../../../utils/filterHelper';
import { delay, encodeBase64, titleCase } from '../../../utils/utils';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { MessagePreview } from '../topics/Tab.Messages';
import { ExpandedMessage } from '../topics/Tab.Messages';
import { getConnectorFriendlyName } from './ConnectorBoxCard';
import { ConfirmModal, NotConfigured, TaskState, statusColors } from './helper';

const LOGS_TOPIC_NAME = '__redpanda.connectors_logs';

export type UpdatingConnectorData = { clusterName: string; connectorName: string };
export type RestartingTaskData = { clusterName: string; connectorName: string; taskId: number };
interface LocalConnectorState {
  pausingConnector: ClusterConnectorInfo | null;
  restartingConnector: ClusterConnectorInfo | null;
  updatingConnector: UpdatingConnectorData | null;
  restartingTask: RestartingTaskData | null;
  deletingConnector: string | null;
}
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
      init();
    }, [connectClusterStore]);

    const $state = useLocalObservable<LocalConnectorState>(() => ({
      pausingConnector: null,
      restartingConnector: null,
      updatingConnector: null,
      restartingTask: null,
      deletingConnector: null,
    }));
    if (!connectClusterStore.isInitialized) {
      return <Skeleton mt={5} noOfLines={20} height={4} />;
    }

    const connectorStore = connectClusterStore.getConnectorStore(connectorName);

    const connector = connectClusterStore.getRemoteConnector(connectorName);

    const canEdit = connectClusterStore.canEdit;
    if (!connector) return null;

    return (
      <>
        {/* [Pause] [Restart] [Delete] */}
        <Flex flexDirection="row" alignItems="center" gap="3">
          {/* [Pause/Resume] */}
          {connectClusterStore.validateConnectorState(connectorName, ['RUNNING', 'PAUSED']) ? (
            <Tooltip
              placement="top"
              isDisabled={canEdit !== true}
              label={"You don't have 'canEditConnectCluster' permissions for this connect cluster"}
              hasArrow={true}
            >
              <Button
                isDisabled={!canEdit}
                onClick={() => ($state.pausingConnector = connector)}
                variant="outline"
                minWidth="32"
              >
                {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Pause' : 'Resume'}
              </Button>
            </Tooltip>
          ) : null}

          {/* [Restart] */}
          <Tooltip
            placement="top"
            isDisabled={canEdit !== true}
            label={"You don't have 'canEditConnectCluster' permissions for this connect cluster"}
            hasArrow={true}
          >
            <Button
              isDisabled={!canEdit}
              onClick={() => ($state.restartingConnector = connector)}
              variant="outline"
              minWidth="32"
            >
              Restart
            </Button>
          </Tooltip>

          {/* [Delete] */}
          <Tooltip
            placement="top"
            isDisabled={canEdit !== true}
            label={"You don't have 'canEditConnectCluster' permissions for this connect cluster"}
            hasArrow={true}
          >
            <Button
              variant="outline"
              colorScheme="red"
              isDisabled={!canEdit}
              onClick={() => ($state.deletingConnector = connectorName)}
              minWidth="32"
            >
              Delete
            </Button>
          </Tooltip>
        </Flex>

        <Tabs
          marginBlock="2"
          size="lg"
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
                    {connectorStore && <ConfigPage connectorStore={connectorStore} context="EDIT" />}
                  </Box>

                  {/* Update Config Button */}
                  <Flex m={4} mb={6}>
                    <Tooltip
                      placement="top"
                      isDisabled={canEdit !== true}
                      label={"You don't have 'canEditConnectCluster' permissions for this connect cluster"}
                      hasArrow={true}
                    >
                      <Button
                        variant="outline"
                        style={{ width: '200px' }}
                        isDisabled={(() => {
                          if (!canEdit) return true;
                          if (!connector) return true;
                          const connectorConfigObject = connectorStore?.getConfigObject();
                          if (connectorConfigObject && comparer.shallow(connector.config, connectorConfigObject)) {
                            return true;
                          }
                        })()}
                        onClick={() => {
                          $state.updatingConnector = { clusterName, connectorName };
                        }}
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
        />

        {/* Pause/Resume Modal */}
        <ConfirmModal<ClusterConnectorInfo>
          target={() => $state.pausingConnector}
          clearTarget={() => ($state.pausingConnector = null)}
          content={(c) => (
            <>
              {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Pause' : 'Resume'} connector{' '}
              <strong>{c.name}</strong>?
            </>
          )}
          successMessage={(c) => (
            <>
              {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Resumed' : 'Paused'} connector{' '}
              <strong>{c.name}</strong>
            </>
          )}
          onOk={async (c) => {
            if (connectClusterStore.validateConnectorState(connectorName, ['RUNNING']))
              await api.pauseConnector(clusterName, c.name);
            else await api.resumeConnector(clusterName, c.name);
            await delay(500);
            await refreshData(true);
          }}
        />

        {/* Restart */}
        <ConfirmModal<ClusterConnectorInfo>
          target={() => $state.restartingConnector}
          clearTarget={() => ($state.restartingConnector = null)}
          content={(c) => (
            <>
              Restart connector <strong>{c.name}</strong>?
            </>
          )}
          successMessage={(c) => (
            <>
              Successfully restarted connector <strong>{c.name}</strong>
            </>
          )}
          onOk={async (c) => {
            await api.restartConnector(clusterName, c.name);
            await refreshData(true);
          }}
        />

        {/* Update Config */}
        <ConfirmModal<UpdatingConnectorData>
          target={() => $state.updatingConnector}
          clearTarget={() => ($state.updatingConnector = null)}
          content={(c) => (
            <>
              Update configuration of connector <strong>{c.connectorName}</strong>?
            </>
          )}
          successMessage={(c) => (
            <>
              Successfully updated config of <strong>{c.connectorName}</strong>
            </>
          )}
          onOk={async (c) => {
            connectClusterStore.getConnectorStore(c.connectorName);
            await connectClusterStore.updateConnnector(c.connectorName);
            appGlobal.history.push(`/connect-clusters/${encodeURIComponent(clusterName)}`);
            await refreshData(true);
          }}
        />

        {/* Restart Task */}
        <ConfirmModal<RestartingTaskData>
          target={() => $state.restartingTask}
          clearTarget={() => ($state.restartingTask = null)}
          content={(c) => (
            <>
              Restart task <strong>{c.taskId}</strong> of <strong>{c.connectorName}</strong>?
            </>
          )}
          successMessage={(c) => (
            <>
              Successfully restarted <strong>{c.taskId}</strong> of <strong>{c.connectorName}</strong>
            </>
          )}
          onOk={async (c) => {
            await api.restartTask(c.clusterName, c.connectorName, c.taskId);
            await refreshData(true);
          }}
        />

        {/* Delete Connector */}
        <ConfirmModal<string>
          target={() => $state.deletingConnector}
          clearTarget={() => ($state.deletingConnector = null)}
          content={(c) => (
            <>
              Delete connector <strong>{c}</strong>?
            </>
          )}
          successMessage={(c) => (
            <>
              Deleted connector <strong>{c}</strong>
            </>
          )}
          onOk={async (_connectorName) => {
            await connectClusterStore.deleteConnector(connectorName);
            await refreshData(true);
            appGlobal.history.push(`/connect-clusters/${encodeURIComponent(clusterName)}`);
          }}
        />
      </>
    );
  },
);

const ConfigOverviewTab = observer(
  (p: {
    clusterName: string;
    connectClusterStore: ConnectClusterStore;
    connector: ClusterConnectorInfo;
  }) => {
    const { connectClusterStore, connector } = p;
    const connectorName = connector.name;

    return (
      <>
        <Grid
          templateAreas={`
                "errors errors"
                "health details"
                "tasks details"
            `}
          gridTemplateRows="auto"
          alignItems="start"
          gap="6"
        >
          <Flex gridArea="errors" flexDirection="column" gap="2">
            {connector.errors.map((e) => (
              <ConnectorErrorModal key={e.title} error={e} />
            ))}
          </Flex>

          <Section gridArea="health">
            <Flex flexDirection="row" gap="4" m="1">
              <Box width="5px" borderRadius="3px" background={statusColors[connector.status]} />

              <Flex flexDirection="column">
                <Text fontWeight="semibold" fontSize="3xl">
                  {titleCase(connector.status)}
                </Text>
                <Text opacity=".5">Status</Text>
              </Flex>
            </Flex>
          </Section>

          <Section py={4} gridArea="tasks" minWidth="500px">
            <Flex alignItems="center" mt="2" mb="6" gap="2">
              <Heading as="h3" fontSize="1rem" fontWeight="semibold" textTransform="uppercase" color="blackAlpha.800">
                Tasks
              </Heading>
              <Text opacity=".5" fontWeight="normal">
                ({connectClusterStore.getConnectorTasks(connectorName)?.length || 0})
              </Text>
            </Flex>
            <DataTable<ClusterConnectorTaskInfo>
              data={connectClusterStore.getConnectorTasks(connectorName) ?? []}
              pagination
              defaultPageSize={10}
              sorting
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
            />
          </Section>

          <Section py={4} gridArea="details">
            <Heading
              as="h3"
              mb="6"
              mt="2"
              fontSize="1rem"
              fontWeight="semibold"
              textTransform="uppercase"
              color="blackAlpha.800"
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
      </>
    );
  },
);

const ConnectorErrorModal = observer((p: { error: ConnectorError }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  const errorType = p.error.type === 'ERROR' ? 'error' : 'warning';

  const hasConnectorLogs = api.topics?.any((x) => x.topicName === LOGS_TOPIC_NAME);

  return (
    <>
      <Alert status={errorType} variant="solid" height="12" borderRadius="8px" onClick={onOpen}>
        <AlertIcon />
        <Box wordBreak="break-all" whiteSpace="break-spaces">
          {p.error.title}
        </Box>
        <Button ml="auto" variant="ghost" colorScheme="gray" size="sm" mt="1px">
          View details
        </Button>
      </Alert>

      <RPModal onClose={onClose} size="6xl" isOpen={isOpen}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{p.error.title}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <CodeBlock language="json" codeString={p.error.content} showScroll={false} />
          </ModalBody>
          <ModalFooter gap={2}>
            {hasConnectorLogs && (
              <Button onClick={() => appGlobal.history.push(`/topics/${LOGS_TOPIC_NAME}`)} mr="auto">
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
      },
    );
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  async refreshData(force: boolean): Promise<void> {
    ConnectClusterStore.connectClusters.clear();
    await api.refreshConnectClusters(force);

    // refresh topics so we know whether or not we can show the "go to error logs topic" button in the connector details error popup
    // and show the logs tab
    api.refreshTopics(force);
  }

  render() {
    const clusterName = decodeURIComponent(this.props.clusterName);
    const connectorName = decodeURIComponent(this.props.connector);

    if (api.connectConnectors?.isConfigured === false) return <NotConfigured />;

    return (
      <PageContent>
        <KafkaConnectorMain clusterName={clusterName} connectorName={connectorName} refreshData={this.refreshData} />
      </PageContent>
    );
  }
}

export default KafkaConnectorDetails;

const ConnectorDetails = observer(
  (p: {
    clusterName: string;
    connectClusterStore: ConnectClusterStore;
    connector: ClusterConnectorInfo;
  }) => {
    const store = p.connectClusterStore.getConnectorStore(p.connector.name);

    const allProps = [...(store?.propsByName.values() ?? [])];

    const items = allProps
      .filter((x) => {
        if (x.isHidden) return false;
        if (x.entry.definition.type === DataType.Password) return false;
        if (x.entry.definition.importance !== PropertyImportance.High) return false;

        if (!x.value) return false;
        if (x.name === 'name') return false;

        return true;
      })
      .orderBy((x) => {
        let i = 0;
        for (const s of store?.connectorStepDefinitions ?? [])
          for (const g of s.groups)
            for (const p of g.config_keys) {
              if (p === x.name) return i;
              i++;
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
      <Grid templateColumns="auto 1fr" rowGap="3" columnGap="10">
        {displayEntries.map((x) => (
          <React.Fragment key={x.name}>
            <Text fontWeight="semibold" whiteSpace="nowrap">
              {x.name}
            </Text>
            <Text whiteSpace="nowrap" textOverflow="ellipsis" overflow="hidden" title={x.value}>
              {x.value}
            </Text>
          </React.Fragment>
        ))}
      </Grid>
    );
  },
);

const LogsTab = observer(
  (p: {
    clusterName: string;
    connectClusterStore: ConnectClusterStore;
    connector: ClusterConnectorInfo;
  }) => {
    const { connector } = p;
    const connectorName = connector.name;
    const topicName = LOGS_TOPIC_NAME;
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
      const searchPromise = executeMessageSearch(search, topicName, connectorName);
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
        <Box my="1rem">The logs below are for the last three hours.</Box>

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

async function executeMessageSearch(search: MessageSearch, topicName: string, connectorKey: string) {
  const filterCode: string = `return key == "${connectorKey}";`;

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
  return transaction(async () => {
    try {
      search.startSearch(request).catch((err) => {
        const msg = (err as Error).message ?? String(err);
        console.error(`error in connectorLogsMessageSearch: ${msg}`);
        return [];
      });
    } catch (error: any) {
      console.error(`error in connectorLogsMessageSearch: ${(error as Error).message ?? String(error)}`);
      return [];
    }
  });
}
