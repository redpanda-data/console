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

import React, { useEffect, useRef, useState } from 'react';

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
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { CodeBlock, Pre } from 'components/redpanda-ui/components/code-block';
import { DataTable, type DataTableColumnDef } from 'components/redpanda-ui/components/data-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input, InputEnd, InputStart } from 'components/redpanda-ui/components/input';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { ChevronDown, ChevronRight, CircleAlertIcon, SearchIcon, TriangleAlertIcon, XIcon } from 'lucide-react';

import { getConnectorFriendlyName } from './connector-box-card';
import { ConfirmModal, NotConfigured, statusColors, TaskState } from './helper';
import usePaginationParams from '../../../hooks/use-pagination-params';
import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { PartitionOffsetOrigin } from '../../../state/ui';
import { sanitizeString } from '../../../utils/filter-helper';
import { delay, encodeBase64, titleCase } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import Tabs from '../../misc/tabs/tabs';
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

const KafkaConnectorMain = ({
  clusterName,
  connectorName,
  refreshData,
}: {
  clusterName: string;
  connectorName: string;
  refreshData: (force: boolean) => Promise<void>;
}) => {
  const [connectClusterStore] = useState(() => ConnectClusterStore.getInstance(clusterName));

  const logsTopic = api.topics?.first((x) => x.topicName === LOGS_TOPIC_NAME);

  useEffect(() => {
    const init = async () => {
      await connectClusterStore.setup();
    };
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    init().catch(console.error);
  }, [connectClusterStore]);

  const [$state, setStateInternal] = useState<LocalConnectorState>({
    pausingConnector: null,
    restartingConnector: null,
    updatingConnector: null,
    restartingTask: null,
    deletingConnector: null,
  });
  const setS = (patch: Partial<LocalConnectorState>) => setStateInternal((prev) => ({ ...prev, ...patch }));

  if (!connectClusterStore.isInitialized) {
    return <SkeletonText className="mt-5" lines={20} width="full" />;
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
      <div className="flex flex-row items-center gap-3">
        {/* [Pause/Resume] */}
        {connectClusterStore.validateConnectorState(connectorName, ['RUNNING', 'PAUSED']) ? (
          <NoEditPermissionTooltip canEdit={canEdit}>
            <Button
              className="min-w-32"
              disabled={!canEdit}
              onClick={() => {
                setS({ pausingConnector: connector });
              }}
              variant="outline"
            >
              {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Pause' : 'Resume'}
            </Button>
          </NoEditPermissionTooltip>
        ) : null}

        {/* [Restart] */}
        <NoEditPermissionTooltip canEdit={canEdit}>
          <Button
            className="min-w-32"
            disabled={!canEdit}
            onClick={() => {
              setS({ restartingConnector: connector });
            }}
            variant="outline"
          >
            Restart
          </Button>
        </NoEditPermissionTooltip>

        {/* [Delete] */}
        <NoEditPermissionTooltip canEdit={canEdit}>
          <Button
            className="min-w-32"
            disabled={!canEdit}
            onClick={() => {
              setS({ deletingConnector: connectorName });
            }}
            variant="destructive-outline"
          >
            Delete
          </Button>
        </NoEditPermissionTooltip>
      </div>

      <Tabs
        tabs={[
          {
            key: 'overview',
            title: 'Overview',
            content: (
              <div className="mt-8">
                <ConfigOverviewTab
                  clusterName={clusterName}
                  connectClusterStore={connectClusterStore}
                  connector={connector}
                />
              </div>
            ),
          },
          {
            key: 'configuration',
            title: 'Configuration',
            content: (
              <div className="mt-8">
                <div className="max-w-[800px]">
                  {Boolean(connectorStore) && (
                    // biome-ignore lint/style/noNonNullAssertion: checked above with Boolean(connectorStore)
                    <ConfigPage connectorStore={connectorStore!} context="EDIT" />
                  )}
                </div>

                {/* Update Config Button */}
                <div className="m-4 mb-6 flex">
                  <NoEditPermissionTooltip canEdit={canEdit}>
                    <Button
                      className="w-[200px]"
                      disabled={!canEdit}
                      onClick={() => {
                        setS({ updatingConnector: { clusterName, connectorName } });
                      }}
                      variant="outline"
                    >
                      Update Config
                    </Button>
                  </NoEditPermissionTooltip>
                </div>
              </div>
            ),
          },
          {
            key: 'logs',
            // Chakra's Tabs took the reason as `isDisabled`; the app wrapper takes a boolean, so
            // the reason moves to a tooltip on the trigger.
            disabled: !logsTopic,
            title: logsTopic ? (
              'Logs'
            ) : (
              <Tooltip>
                <TooltipTrigger render={<span>Logs</span>} />
                <TooltipContent side="top">{`Logs topic '${LOGS_TOPIC_NAME}' does not exist.`}</TooltipContent>
              </Tooltip>
            ),
            content: (
              <div className="mt-8">
                <LogsTab clusterName={clusterName} connectClusterStore={connectClusterStore} connector={connector} />
              </div>
            ),
          },
        ]}
      />

      {/* Pause/Resume Modal */}
      <ConfirmModal<ClusterConnectorInfo>
        clearTarget={() => {
          setS({ pausingConnector: null });
        }}
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
        clearTarget={() => {
          setS({ restartingConnector: null });
        }}
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
            Connector <strong>{c.name}</strong> restarted
          </>
        )}
        target={() => $state.restartingConnector}
      />

      {/* Update Config */}
      <ConfirmModal<UpdatingConnectorData>
        clearTarget={() => {
          setS({ updatingConnector: null });
        }}
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
            Config of <strong>{c.connectorName}</strong> updated
          </>
        )}
        target={() => $state.updatingConnector}
      />

      {/* Restart Task */}
      <ConfirmModal<RestartingTaskData>
        clearTarget={() => {
          setS({ restartingTask: null });
        }}
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
            Task <strong>{c.taskId}</strong> of <strong>{c.connectorName}</strong> restarted
          </>
        )}
        target={() => $state.restartingTask}
      />

      {/* Delete Connector */}
      <ConfirmModal<string>
        clearTarget={() => {
          setS({ deletingConnector: null });
        }}
        content={(c) => (
          <>
            Delete connector <strong>{c}</strong>?
          </>
        )}
        onOk={async (_connectorName) => {
          await connectClusterStore.deleteConnector(connectorName);
        }}
        onSuccess={() => {
          // Navigate after the success toast has been queued.
          // Refreshing before navigation would cause the connector to disappear
          // from the store, unmounting this component before the toast renders.
          // The cluster-list page refreshes on its own when it mounts.
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
};

const ConfigOverviewTab = (p: {
  clusterName: string;
  connectClusterStore: ConnectClusterStore;
  connector: ClusterConnectorInfo;
}) => {
  const { connectClusterStore, connector } = p;
  const connectorName = connector.name;

  return (
    <div
      // The template areas are inline: Tailwind has no arbitrary grid-template-areas utility.
      className="grid items-start gap-6"
      style={{
        gridTemplateAreas: '"errors errors" "health details" "tasks details"',
        gridTemplateRows: 'auto',
      }}
    >
      <div className="flex flex-col gap-2" style={{ gridArea: 'errors' }}>
        {connector.errors.map((e) => (
          <ConnectorErrorModal error={e} key={e.title} />
        ))}
      </div>

      <Section style={{ gridArea: 'health' }}>
        <div className="m-1 flex flex-row gap-4">
          <div className="w-[5px] rounded-[3px]" style={{ background: statusColors[connector.status] }} />

          <div className="flex flex-col">
            <div className="font-semibold text-heading-lg">{titleCase(connector.status)}</div>
            <div className="opacity-50">Status</div>
          </div>
        </div>
      </Section>

      <Section className="min-w-[500px] py-4" style={{ gridArea: 'tasks' }}>
        <div className="mt-2 mb-6 flex items-center gap-2">
          <h3 className="font-semibold text-[1rem] text-strong uppercase">Tasks</h3>
          <div className="font-normal opacity-50">
            ({connectClusterStore.getConnectorTasks(connectorName)?.length || 0})
          </div>
        </div>
        <DataTable<ClusterConnectorTaskInfo>
          columns={taskColumns}
          data={connectClusterStore.getConnectorTasks(connectorName) ?? []}
          pagination
          sorting
          tableOptions={{ initialState: { pagination: { pageIndex: 0, pageSize: 10 } } }}
        />
      </Section>

      <Section className="py-4" style={{ gridArea: 'details' }}>
        <h3 className="mt-2 mb-6 font-semibold text-[1rem] text-strong uppercase">Connector Details</h3>

        <ConnectorDetails clusterName={p.clusterName} connectClusterStore={connectClusterStore} connector={connector} />
      </Section>
    </div>
  );
};

const taskColumns: DataTableColumnDef<ClusterConnectorTaskInfo>[] = [
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
];

const ConnectorErrorModal = (p: { error: ConnectorError }) => {
  const [isOpen, setIsOpen] = useState(false);

  const isError = p.error.type === 'ERROR';

  const hasConnectorLogs = api.topics?.any((x) => x.topicName === LOGS_TOPIC_NAME);

  return (
    <>
      {/* The whole banner opens the detail dialog; "View details" is the visible affordance for it. */}
      <Alert
        className="cursor-pointer items-center"
        icon={isError ? <CircleAlertIcon /> : <TriangleAlertIcon />}
        onClick={() => setIsOpen(true)}
        variant={isError ? 'destructive' : 'warning'}
      >
        <AlertDescription className="w-full grid-flow-col items-center justify-between">
          <div className="whitespace-break-spaces break-all">{p.error.title}</div>
          <Button size="sm" variant="ghost">
            View details
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setIsOpen(false);
          }
        }}
        open={isOpen}
      >
        <DialogContent size="full">
          <DialogHeader>
            <DialogTitle>{p.error.title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <CodeBlock maxHeight="none" width="full">
              <Pre>{p.error.content}</Pre>
            </CodeBlock>
          </DialogBody>
          <DialogFooter>
            {Boolean(hasConnectorLogs) && (
              <Button className="mr-auto" onClick={() => appGlobal.historyPush(`/topics/${LOGS_TOPIC_NAME}`)}>
                Show Logs
              </Button>
            )}
            <Button onClick={() => setIsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

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

    // Touch observables so PageComponent's Reaction tracks them for re-renders.
    void api.topics;

    return (
      <PageContent>
        <KafkaConnectorMain clusterName={clusterName} connectorName={connectorName} refreshData={this.refreshData} />
      </PageContent>
    );
  }
}

export default KafkaConnectorDetails;

const ConnectorDetails = (p: {
  clusterName: string;
  connectClusterStore: ConnectClusterStore;
  connector: ClusterConnectorInfo;
}) => {
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
    <div className="grid grid-cols-[auto_1fr] gap-x-10 gap-y-3">
      {displayEntries.map((x) => (
        <React.Fragment key={x.name}>
          <div className="whitespace-nowrap font-semibold">{x.name}</div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap" title={x.value}>
            {x.value}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

/**
 * Wraps a control that is disabled without `canEditConnectCluster`, explaining why. Chakra's
 * Tooltip took `isDisabled` to suppress itself; Base UI has no such prop, so the wrapper renders
 * the child bare when the permission is present.
 */
const NoEditPermissionTooltip = ({
  canEdit,
  children,
}: {
  canEdit: boolean | null | undefined;
  children: React.ReactElement;
}) => {
  if (canEdit) {
    return children;
  }

  return (
    <Tooltip>
      {/* A disabled button fires no pointer events, so the tooltip hangs off a wrapper. */}
      <TooltipTrigger render={<span className="inline-flex">{children}</span>} />
      <TooltipContent side="top">
        You don't have 'canEditConnectCluster' permissions for this connect cluster
      </TooltipContent>
    </Tooltip>
  );
};

const LogsTab = (p: {
  clusterName: string;
  connectClusterStore: ConnectClusterStore;
  connector: ClusterConnectorInfo;
}) => {
  const { connector } = p;
  const connectorName = connector.name;
  const topicName = LOGS_TOPIC_NAME;
  const topic = api.topics?.first((x) => x.topicName === topicName);

  const [logState, setLogState] = useState<{ messages: TopicMessage[]; isComplete: boolean }>({
    messages: [],
    isComplete: false,
  });
  const { messages, isComplete } = logState;
  const [logsQuickSearch, setLogsQuickSearch] = useState('');
  const searchRef = useRef<MessageSearch | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    searchRef.current?.stopSearch();
    const search = createMessageSearch();
    searchRef.current = search;
    queueMicrotask(() => setLogState({ messages: [], isComplete: false }));
    executeMessageSearch(search, topicName, connectorName)
      .catch((x) => {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('error loading connector logs', x);
      })
      .finally(() => {
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
    const result = await search.startSearch(searchReq);

    if (result && result.length === 1) {
      setLogState((prev) => {
        const updated = [...prev.messages];
        const idx = updated.findIndex((x) => x.partitionID === partitionID && x.offset === offset);
        if (idx > -1) updated[idx] = result[0];
        return { ...prev, messages: updated };
      });
    } else {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('LoadLargeMessage: messages response is empty', { result });
      throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
    }
  };

  const paginationParams = usePaginationParams(messages.length, 10);
  const messageTableColumns: DataTableColumnDef<TopicMessage>[] = [
    // Chakra's DataTable injected this column whenever `subComponent` was set; the Registry one does not.
    {
      id: 'expander',
      size: 40,
      enableSorting: false,
      cell: ({ row }) =>
        row.getCanExpand() ? (
          <Button
            aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
            onClick={row.getToggleExpandedHandler()}
            size="icon-xs"
            variant="ghost"
          >
            {row.getIsExpanded() ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        ) : null,
    },
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
      <div className="my-4">The logs below are for the last three hours.</div>

      <Section className="min-w-[800px]">
        <div className="mb-6 flex">
          <Input
            containerClassName="max-w-[230px]"
            onChange={(e) => setLogsQuickSearch(e.target.value)}
            placeholder="Search..."
            testId="search-field-input"
            value={logsQuickSearch}
          >
            <InputStart>
              <SearchIcon className="size-4 text-muted-foreground" data-testid="search-field-search-icon" />
            </InputStart>
            {logsQuickSearch !== '' && (
              <InputEnd className="pointer-events-auto">
                <Button
                  aria-label="Clear search"
                  data-testid="search-field-reset-icon"
                  onClick={() => setLogsQuickSearch('')}
                  size="icon-xs"
                  variant="ghost"
                >
                  <XIcon />
                </Button>
              </InputEnd>
            )}
          </Input>
          <Button className="ml-auto" onClick={() => setRefreshCount((c) => c + 1)} variant="outline">
            Refresh logs
          </Button>
        </div>

        <DataTable<TopicMessage>
          columns={messageTableColumns}
          data={filteredMessages}
          emptyText="No messages"
          isLoading={!isComplete}
          subComponent={({ row: { original } }) => (
            <ExpandedMessage
              loadLargeMessage={() =>
                loadLargeMessage(
                  searchRef.current?.searchRequest?.topicName ?? topicName,
                  original.partitionID,
                  original.offset
                )
              }
              msg={original}
            />
          )}
          tableOptions={{ initialState: { pagination: paginationParams } }}
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
}
