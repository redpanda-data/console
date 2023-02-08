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

/* eslint-disable no-useless-escape */
import { Button, Skeleton, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { observer, useLocalObservable } from 'mobx-react';
import { comparer } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { Code, findPopupContainer } from '../../../utils/tsxUtils';
import { sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import { PageComponent, PageInitHelper } from '../Page';
import { ConnectClusterStore } from '../../../state/connect/state';
import { ConfigPage } from './dynamic-ui/components';

import './helper';

// React Editor

// Monaco Type
import { ConfirmModal, ConnectorStatisticsCard, NotConfigured, okIcon, TaskState, warnIcon } from './helper';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { isEmbedded } from '../../../config';
import { delay } from '../../../utils/utils';

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
        if (!connectClusterStore.isInitialized)
            return (
                <div>
                    <Skeleton loading={true} active={true} paragraph={{ rows: 20, width: '100%' }} />
                </div>
            );

        const connectorStore = connectClusterStore.getConnectorStore(connectorName);

        const connector = connectClusterStore.getRemoteConnector(connectorName);

        const canEdit = connectClusterStore.canEdit;
        if (!connector) return null;
        return (
            <>
                <Section>
                    {/* Title + Pause/Restart + Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', margin: '.5em 0', paddingLeft: '2px' }}>
                        <span style={{ display: 'inline-flex', gap: '.5em', alignItems: 'center' }}>
                            <span style={{ fontSize: '17px', display: 'inline-block' }}>
                                {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? okIcon : warnIcon}
                            </span>
                            <span style={{ fontSize: 'medium', fontWeight: 600, lineHeight: '0px', marginBottom: '1px' }}>
                                {connectorName}
                            </span>
                            <span style={{ fontSize: 'small', opacity: 0.5 }}>
                                ({connectClusterStore.getConnectorState(connectorName)?.toLowerCase() ?? '<empty>'})
                            </span>
                        </span>

                        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '.5em', fontSize: '12px' }}>
                            {connectClusterStore.validateConnectorState(connectorName, ['FAILED', 'UNASSIGNED']) ? (
                                <TaskState observable={connector} />
                            ) : (
                                <>
                                    <Tooltip
                                        placement="top"
                                        trigger={!canEdit ? 'hover' : 'none'}
                                        mouseLeaveDelay={0}
                                        getPopupContainer={findPopupContainer}
                                        overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                                    >
                                        <Button disabled={!canEdit} onClick={() => ($state.pausingConnector = connector)}>
                                            {connectClusterStore.validateConnectorState(connectorName, ['RUNNING']) ? 'Pause' : 'Resume'}
                                        </Button>
                                    </Tooltip>
                                    <Tooltip
                                        placement="top"
                                        trigger={!canEdit ? 'hover' : 'none'}
                                        mouseLeaveDelay={0}
                                        getPopupContainer={findPopupContainer}
                                        overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                                    >
                                        <Button disabled={!canEdit} onClick={() => ($state.restartingConnector = connector)}>
                                            Restart
                                        </Button>
                                    </Tooltip>
                                </>
                            )}
                            <Tooltip
                                placement="top"
                                trigger={!canEdit ? 'hover' : 'none'}
                                mouseLeaveDelay={0}
                                getPopupContainer={findPopupContainer}
                                overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                            >
                                <Button
                                    danger
                                    disabled={!canEdit}
                                    onClick={() => ($state.deletingConnector = connectorName)}
                                    style={{ marginLeft: '1em', minWidth: '8em' }}
                                >
                                    Delete
                                </Button>
                            </Tooltip>
                        </span>
                    </div>

                    {/* Config Page with preloaded values */}
                    {connector ? <ConfigPage connectorStore={connectorStore} /> : <div>no cluster or plugin selected</div>}

                    <div style={{ marginTop: '1em' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '1em 0', marginBottom: '1.5em' }}>
                            <Tooltip
                                placement="top"
                                trigger={!canEdit ? 'hover' : 'none'}
                                mouseLeaveDelay={0}
                                getPopupContainer={findPopupContainer}
                                overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                            >
                                <Button
                                    type="primary"
                                    ghost
                                    style={{ width: '200px' }}
                                    disabled={(() => {
                                        if (!canEdit) return true;
                                        if (!connector) return true;
                                        if (comparer.shallow(connector.config, connectorStore.getConfigObject())) return true;
                                    })()}
                                    onClick={() => {
                                        $state.updatingConnector = { clusterName, connectorName };
                                    }}
                                >
                                    Update Config
                                </Button>
                            </Tooltip>
                        </div>
                    </div>

                    {/* Task List */}
                    <div style={{ marginTop: '1em' }}>
                        <KowlTable
                            key="taskList"
                            dataSource={connectClusterStore.getConnectorTasks(connectorName)}
                            columns={[
                                {
                                    title: 'Task',
                                    dataIndex: 'taskId',
                                    width: 200,
                                    sorter: sortField('taskId'),
                                    defaultSortOrder: 'ascend',
                                    render: (v) => <Code nowrap>Task-{v}</Code>,
                                },
                                {
                                    title: 'Status',
                                    dataIndex: 'state',
                                    sorter: sortField('state'),
                                    render: (_, r) => <TaskState observable={r} />,
                                    filterType: { type: 'enum', optionClassName: 'capitalize', toDisplay: (x) => String(x).toLowerCase() },
                                },
                                {
                                    title: 'Worker',
                                    dataIndex: 'workerId',
                                    sorter: sortField('workerId'),
                                    render: (_, r) => <Code nowrap>{r.workerId}</Code>,
                                    filterType: { type: 'enum' },
                                },
                                {
                                    title: 'Actions',
                                    width: 150,
                                    render: (_, r) => (
                                        <TaskActionsColumn
                                            clusterName={clusterName}
                                            connectorName={connectorName}
                                            taskId={r.taskId}
                                            getRestartingTask={() => $state.restartingTask}
                                            setRestartingTask={(t) => ($state.restartingTask = t)}
                                        />
                                    ),
                                },
                            ]}
                            rowKey="taskId"
                            search={{
                                searchColumnIndex: 0,
                                isRowMatch: (row, regex) =>
                                    regex.test(String(row.taskId)) || regex.test(row.state) || regex.test(row.workerId),
                            }}
                            observableSettings={uiSettings.kafkaConnect.connectorDetails}
                            pagination={{
                                defaultPageSize: 10,
                            }}
                        />
                    </div>
                </Section>

                {/* Pause/Resume */}
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
                        appGlobal.history.push(`/connect-clusters/${clusterName}`);
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
                        appGlobal.history.push(`/connect-clusters/${clusterName}`);
                        await refreshData(true);
                    }}
                />
            </>
        );
    }
);

@observer
class KafkaConnectorDetails extends PageComponent<{ clusterName: string; connector: string }> {
    initPage(p: PageInitHelper): void {
        const clusterName = this.props.clusterName;
        const connector = this.props.connector;
        p.title = connector;
        p.addBreadcrumb('Connectors', '/connect-clusters');
        p.addBreadcrumb(clusterName, `/connect-clusters/${clusterName}`);
        p.addBreadcrumb(connector, `/connect-clusters/${clusterName}/${connector}`);
        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean): Promise<void> {
        await api.refreshConnectClusters(force);
    }

    render() {
        const clusterName = this.props.clusterName;
        const connectorName = this.props.connector;

        if (api.connectConnectors?.isConfigured === false) return <NotConfigured />;

        return (
            <PageContent>
                {isEmbedded() ? <></> : <ConnectorStatisticsCard clusterName={clusterName} connectorName={connectorName} />}

                {/* Main Card */}
                <KafkaConnectorMain clusterName={clusterName} connectorName={connectorName} refreshData={this.refreshData} />
            </PageContent>
        );
    }
}

export default KafkaConnectorDetails;

interface TaskActionsColumnProps {
    clusterName: string;
    connectorName: string;
    taskId: number;
    getRestartingTask: () => RestartingTaskData | null;
    setRestartingTask: (x: RestartingTaskData) => void;
}

const TaskActionsColumn = observer(
    ({ clusterName, connectorName, taskId, getRestartingTask, setRestartingTask }: TaskActionsColumnProps) => {
        const restartingTask = getRestartingTask();
        const isRestarting =
            restartingTask &&
            restartingTask.clusterName == clusterName &&
            restartingTask.connectorName == connectorName &&
            restartingTask.taskId == taskId;

        return (
            <span style={{ display: 'inline-flex', gap: '.75em', alignItems: 'center' }}>
                <span
                    className={'linkBtn' + (isRestarting ? ' disabled' : '')}
                    onClick={() => {
                        if (isRestarting) return;
                        setRestartingTask({
                            clusterName,
                            connectorName,
                            taskId: taskId,
                        });
                    }}
                >
                    Restart
                </span>
            </span>
        );
    }
);
