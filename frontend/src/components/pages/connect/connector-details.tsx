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

import { LOGS_TOPIC_NAME, LogsTab } from './connector-logs-tab';
import 'components/legacy-layout.css';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import React, { useEffect, useState } from 'react';

import { ConfigPage } from './dynamic-ui/components';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { ConnectClusterStore, type Property } from '../../../state/connect/state';
import {
  type ClusterConnectorInfo,
  type ClusterConnectorTaskInfo,
  type ConnectorError,
  DataType,
  PropertyImportance,
} from '../../../types/kafka-connect';
import { PageComponent, type PageInitHelper } from '../page';
import './helper';
import { AlertIcon, WarningIcon } from 'components/icons';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { SyncCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { cn } from 'components/redpanda-ui/lib/utils';
import { reportActionError } from 'utils/toast.utils';

import { getConnectorFriendlyName } from './connector-box-card';
import { ConfirmModal, NotConfigured, statusColors, TaskState } from './helper';
import { arrayOrderBy } from '../../../utils/array-utils';
import { nonzeroNumber } from '../../../utils/number-utils';
import { delay, titleCase } from '../../../utils/utils';
import { PageContent } from '../../misc/page-content';
import { Section } from '../../misc/section';
import { Tabs } from '../../misc/tabs/tabs';

// Ten a page (the Registry default) is the legacy page size for this table.
const TASKS_TABLE_OPTIONS = { enableHiding: false };

export type UpdatingConnectorData = {
  clusterName: string;
  connectorName: string;
};
export type RestartingTaskData = {
  clusterName: string;
  connectorName: string;
  taskId: number;
};
type LocalConnectorState = {
  pausingConnector: ClusterConnectorInfo | null;
  restartingConnector: ClusterConnectorInfo | null;
  updatingConnector: UpdatingConnectorData | null;
  restartingTask: RestartingTaskData | null;
  deletingConnector: string | null;
};

type SetLocalConnectorState = (patch: Partial<LocalConnectorState>) => void;

function useConnectClusterStore(clusterName: string) {
  const [connectClusterStore] = useState(() => ConnectClusterStore.getInstance(clusterName));

  useEffect(() => {
    const init = async () => {
      await connectClusterStore.setup();
    };
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    init().catch(console.error);
  }, [connectClusterStore]);

  return connectClusterStore;
}

function useLocalConnectorState() {
  const [$state, setStateInternal] = useState<LocalConnectorState>({
    pausingConnector: null,
    restartingConnector: null,
    updatingConnector: null,
    restartingTask: null,
    deletingConnector: null,
  });
  const setS: SetLocalConnectorState = (patch) => setStateInternal((prev) => ({ ...prev, ...patch }));

  return [$state, setS] as const;
}

const KafkaConnectorMain = ({
  clusterName,
  connectorName,
  refreshData,
}: {
  clusterName: string;
  connectorName: string;
  refreshData: (force: boolean) => Promise<void>;
}) => {
  const connectClusterStore = useConnectClusterStore(clusterName);
  const [$state, setS] = useLocalConnectorState();

  if (!connectClusterStore.isInitialized) {
    return (
      <div className="mt-5">
        <SkeletonText lines={20} width="full" />
      </div>
    );
  }

  const connector = connectClusterStore.getRemoteConnector(connectorName);
  if (!connector) {
    return null;
  }

  return (
    <>
      <ConnectorActions
        connectClusterStore={connectClusterStore}
        connector={connector}
        connectorName={connectorName}
        setS={setS}
      />

      <ConnectorTabs
        clusterName={clusterName}
        connectClusterStore={connectClusterStore}
        connector={connector}
        connectorName={connectorName}
        setS={setS}
      />

      <ConnectorConfirmModals
        $state={$state}
        clusterName={clusterName}
        connectClusterStore={connectClusterStore}
        connectorName={connectorName}
        refreshData={refreshData}
        setS={setS}
      />
    </>
  );
};

type ConnectorSectionProps = {
  connectClusterStore: ConnectClusterStore;
  connector: ClusterConnectorInfo;
  connectorName: string;
  setS: SetLocalConnectorState;
};

const ConnectorActions = ({ connectClusterStore, connector, connectorName, setS }: ConnectorSectionProps) => {
  const canEdit = connectClusterStore.canEdit;

  // [Pause] [Restart] [Delete]
  return (
    <div className="flex flex-row items-center gap-3">
      {/* [Pause/Resume] */}
      {connectClusterStore.validateConnectorState(connectorName, ['RUNNING', 'PAUSED']) === true ? (
        <NoEditPermissionTooltip canEdit={canEdit}>
          <Button
            className="min-w-32"
            disabled={!(canEdit === true)}
            onClick={() => {
              setS({ pausingConnector: connector });
            }}
            variant="outline"
          >
            {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) === true ? 'Pause' : 'Resume'}
          </Button>
        </NoEditPermissionTooltip>
      ) : null}

      {/* [Restart] */}
      <NoEditPermissionTooltip canEdit={canEdit}>
        <Button
          className="min-w-32"
          disabled={!(canEdit === true)}
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
          disabled={!(canEdit === true)}
          onClick={() => {
            setS({ deletingConnector: connectorName });
          }}
          variant="destructive-outline"
        >
          Delete
        </Button>
      </NoEditPermissionTooltip>
    </div>
  );
};

const ConnectorTabs = ({
  clusterName,
  connectClusterStore,
  connector,
  connectorName,
  setS,
}: ConnectorSectionProps & {
  clusterName: string;
}) => {
  const logsTopic = api.topics?.find((x) => x.topicName === LOGS_TOPIC_NAME);
  const connectorStore = connectClusterStore.getConnectorStore(connectorName);
  const canEdit = connectClusterStore.canEdit;

  return (
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
                    disabled={!(canEdit === true)}
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
          // The Tabs wrapper takes a boolean; the reason goes in a tooltip on the trigger.
          disabled: !logsTopic,
          title: logsTopic ? (
            'Logs'
          ) : (
            <Tooltip delayDuration={150}>
              {/* The disabled trigger sets `aria-disabled:pointer-events-none`, which cascades —
                              without re-enabling them here the tooltip could never open. */}
              <TooltipTrigger render={<span className="pointer-events-auto">Logs</span>} />
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
  );
};

const ConnectorConfirmModals = ({
  $state,
  clusterName,
  connectClusterStore,
  connectorName,
  refreshData,
  setS,
}: Omit<ConnectorSectionProps, 'connector'> & {
  $state: LocalConnectorState;
  clusterName: string;
  refreshData: (force: boolean) => Promise<void>;
}) => (
  <>
    {/* Pause/Resume Modal */}
    <ConfirmModal<ClusterConnectorInfo>
      clearTarget={() => {
        setS({ pausingConnector: null });
      }}
      content={(c) => (
        <>
          {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) === true ? 'Pause' : 'Resume'}{' '}
          connector <strong>{c.name}</strong>?
        </>
      )}
      onOk={async (c) => {
        if (connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) === true) {
          await api.pauseConnector(clusterName, c.name);
        } else {
          await api.resumeConnector(clusterName, c.name);
        }
        await delay(500);
        await refreshData(true);
      }}
      successMessage={(c) => (
        <>
          {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) === true ? 'Resumed' : 'Paused'}{' '}
          connector <strong>{c.name}</strong>
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
      className="console-connector-layout grid items-start gap-6"
    >
      <div className="console-connector-errors flex flex-col gap-2">
        {connector.errors.map((e) => (
          <ConnectorErrorModal error={e} key={e.title} />
        ))}
      </div>

      <Section className="console-connector-health">
        <div className="m-1 flex flex-row gap-4">
          <div className={cn('w-[5px] rounded-full', statusColors[connector.status])} />

          <div className="flex flex-col">
            <div className="text-heading-xl font-semibold">{titleCase(connector.status)}</div>
            <div className="opacity-50">Status</div>
          </div>
        </div>
      </Section>

      <Section className="console-connector-tasks min-w-[500px]" padding="compact">
        <div className="mt-2 mb-6 flex items-center gap-2">
          <h3 className="text-body-lg font-semibold text-strong uppercase">Tasks</h3>
          <div className="font-normal opacity-50">
            ({nonzeroNumber(connectClusterStore.getConnectorTasks(connectorName)?.length) ?? 0})
          </div>
        </div>
        <DataTable<ClusterConnectorTaskInfo>
          columns={taskColumns}
          data={connectClusterStore.getConnectorTasks(connectorName) ?? []}
          // Legacy parity: ten a page, pager only past that.
          pagination={(connectClusterStore.getConnectorTasks(connectorName)?.length ?? 0) > 10}
          sorting
          tableOptions={TASKS_TABLE_OPTIONS}
        />
      </Section>

      <Section className="console-connector-details" padding="compact">
        <h3 className="mt-2 pb-6 text-body-lg font-semibold text-strong uppercase">Connector Details</h3>

        <ConnectorDetails clusterName={p.clusterName} connectClusterStore={connectClusterStore} connector={connector} />
      </Section>
    </div>
  );
};

const taskColumns: DataTableColumnDef<ClusterConnectorTaskInfo>[] = [
  {
    id: 'taskId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Task" />,
    accessorKey: 'taskId',
    cell: ({
      row: {
        original: { taskId },
      },
    }) => <InlineCode className="whitespace-nowrap">Task-{taskId}</InlineCode>,
  },
  {
    id: 'state',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    accessorKey: 'state',
    cell: ({ row: { original } }) => <TaskState observable={original} />,
  },
  {
    id: 'workerId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Worker" />,
    accessorKey: 'workerId',
    cell: ({ row: { original } }) => <InlineCode className="whitespace-nowrap">{original.workerId}</InlineCode>,
  },
];

const ConnectorErrorModal = (p: { error: ConnectorError }) => {
  const [isOpen, setIsOpen] = useState(false);

  const isError = p.error.type === 'ERROR';
  const hasConnectorLogs = api.topics?.some((x) => x.topicName === LOGS_TOPIC_NAME);
  return (
    <>
      <Alert
        className="items-center"
        icon={isError ? <AlertIcon /> : <WarningIcon />}
        variant={isError ? 'destructive' : 'warning'}
      >
        <AlertDescription className="w-full grid-flow-col items-center justify-between">
          <div className="break-all whitespace-break-spaces">{p.error.title}</div>
          <Button onClick={() => setIsOpen(true)} size="sm" variant="ghost">
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
            <SyncCodeBlock code={p.error.content} lang="json" />
          </DialogBody>
          <DialogFooter>
            {Boolean(hasConnectorLogs) && (
              <div className="mr-auto">
                <Button onClick={() => appGlobal.historyPush(`/topics/${LOGS_TOPIC_NAME}`)}>Show Logs</Button>
              </div>
            )}
            <Button onClick={() => setIsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
class KafkaConnectorDetails extends PageComponent<{
  clusterName: string;
  connector: string;
}> {
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
    api.refreshTopics(force).catch(reportActionError);
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

export { KafkaConnectorDetails };

// Visible, non-secret, high-importance properties with a value; the name is already the title.
function isConnectorDetailsProperty(x: Property): boolean {
  return (
    !x.isHidden &&
    x.entry.definition.type !== DataType.Password &&
    x.entry.definition.importance === PropertyImportance.High &&
    Boolean(x.value) &&
    x.name !== 'name'
  );
}

const ConnectorDetails = (p: {
  clusterName: string;
  connectClusterStore: ConnectClusterStore;
  connector: ClusterConnectorInfo;
}) => {
  const store = p.connectClusterStore.getConnectorStore(p.connector.name);

  const allProps = [...(store?.propsByName.values() ?? [])];
  const items = arrayOrderBy(allProps.filter(isConnectorDetailsProperty), (x) => {
    let i = 0;
    const connectorSteps = store?.connectorStepDefinitions ?? [];
    for (const s of connectorSteps) {
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
    if ((e.entry.metadata.recommended_values?.length ?? 0) > 0) {
      const match = e.entry.metadata.recommended_values?.find((x) => x.value === e.value);
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
          <div className="font-semibold whitespace-nowrap">{x.name}</div>
          <ElementTooltip content={x.value}>
            <div className="truncate">{x.value}</div>
          </ElementTooltip>
        </React.Fragment>
      ))}
    </div>
  );
};

/**
 * Wraps a control that is disabled without `canEditConnectCluster`, explaining why. Tooltip has no
 * prop to suppress itself, so the wrapper renders the child bare when the permission is present.
 */
const NoEditPermissionTooltip = ({
  canEdit,
  children,
}: {
  canEdit: boolean | null | undefined;
  children: React.ReactElement;
}) => {
  if (canEdit === true) {
    return children;
  }

  return (
    <Tooltip delayDuration={150}>
      {/* A disabled button fires no pointer events, so the tooltip hangs off a wrapper. */}
      <TooltipTrigger render={<span className="inline-flex">{children}</span>} />
      <TooltipContent side="top">
        You don't have 'canEditConnectCluster' permissions for this connect cluster
      </TooltipContent>
    </Tooltip>
  );
};
