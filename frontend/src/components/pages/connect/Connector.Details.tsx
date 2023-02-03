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
import { Button,  Tooltip } from 'antd';
import { observer } from 'mobx-react';
import { comparer } from 'mobx';
import { Component } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { Code, findPopupContainer } from '../../../utils/tsxUtils';
import { sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import { PageComponent, PageInitHelper } from '../Page';
import { connectClustersState, RestartingTaskData, UpdatingConnectorData,  } from '../../../state/connect/state';
import { /* ConfigPage */ ConfigPage } from './dynamic-ui/components';

import './helper';

// React Editor

// Monaco Type
import { ConfirmModal, ConnectorStatisticsCard, NotConfigured, okIcon, TaskState, warnIcon } from './helper';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { isEmbedded } from '../../../config';



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
        api.refreshClusterAdditionalInfo(this.props.clusterName, force);
    }

    render() {
        const clusterName = this.props.clusterName;
        const connectorName = this.props.connector;

        if (api.connectConnectors?.isConfigured === false) return <NotConfigured />;

        const cluster = api.connectConnectors?.clusters?.first((c) => c.clusterName == clusterName);
        if (!cluster) return 'cluster not found';
        const connectorStore = connectClustersState.getConnectorState({ clusterName, connectorName });

        const connector = connectorStore?.connectorInfo;
        if (!connector) return 'connector not found';

        const state = connector.state.toLowerCase();
        const isRunning = state == 'running';

        const tasks = connector.tasks;

        const canEdit = connectorStore.canEdit;
        return (
            <PageContent>
                {isEmbedded() ? <></> : <ConnectorStatisticsCard clusterName={clusterName} connectorName={connectorName} />}

                {/* Main Card */}
                <Section>
                    {/* Title + Pause/Restart + Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', margin: '.5em 0', paddingLeft: '2px' }}>
                        <span style={{ display: 'inline-flex', gap: '.5em', alignItems: 'center' }}>
                            <span style={{ fontSize: '17px', display: 'inline-block' }}>{isRunning ? okIcon : warnIcon}</span>
                            <span style={{ fontSize: 'medium', fontWeight: 600, lineHeight: '0px', marginBottom: '1px' }}>
                                {connectorName}
                            </span>
                            <span style={{ fontSize: 'small', opacity: 0.5 }}>({state ?? '<empty>'})</span>
                        </span>

                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '.5em', fontSize: '12px' }}>
                            <Tooltip
                                placement="top"
                                trigger={!canEdit ? 'hover' : 'none'}
                                mouseLeaveDelay={0}
                                getPopupContainer={findPopupContainer}
                                overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                            >
                                <Button disabled={!canEdit} onClick={() => (connectorStore.pausingConnector = connector)}>
                                    {isRunning ? 'Pause' : 'Resume'}
                                </Button>
                            </Tooltip>
                            <Tooltip
                                placement="top"
                                trigger={!canEdit ? 'hover' : 'none'}
                                mouseLeaveDelay={0}
                                getPopupContainer={findPopupContainer}
                                overlay={'You don\'t have \'canEditConnectCluster\' permissions for this connect cluster'}
                            >
                                <Button disabled={!canEdit} onClick={() => (connectorStore.restartingConnector = connector)}>
                                    Restart
                                </Button>
                            </Tooltip>
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
                                    onClick={() => (connectorStore.deletingConnector = connectorName)}
                                    style={{ marginLeft: '1em', minWidth: '8em' }}
                                >
                                    Delete
                                </Button>
                            </Tooltip>
                        </span>
                    </div>

                    {/* Config Page with preloaded values */}
                    {connector ? <ConfigPage connectorStore={connectorStore.connectorDefinition} /> : <div>no cluster or plugin selected</div>}

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
                                        if (comparer.shallow(connector.config, connectorStore.connectorDefinition.getConfigObject())) return true;
                                    })()}
                                    onClick={() => {
                                        connectorStore.updatingConnector = { clusterName, connectorName };
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
                            dataSource={tasks}
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
                                            getRestartingTask={() => connectorStore.restartingTask}
                                            setRestartingTask={(t) => (connectorStore.restartingTask = t)}
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
                    target={() => connectorStore.pausingConnector}
                    clearTarget={() => (connectorStore.pausingConnector = null)}
                    content={(c) => (
                        <>
                            {isRunning ? 'Pause' : 'Resume'} connector <strong>{c.name}</strong>?
                        </>
                    )}
                    successMessage={(c) => (
                        <>
                            {isRunning ? 'Resumed' : 'Paused'} connector <strong>{c.name}</strong>
                        </>
                    )}
                    onOk={async (c) => {
                        if (isRunning) await api.pauseConnector(clusterName, c.name);
                        else await api.resumeConnector(clusterName, c.name);
                        await this.refreshData(true);
                    }}
                />

                {/* Restart */}
                <ConfirmModal<ClusterConnectorInfo>
                    target={() => connectorStore.restartingConnector}
                    clearTarget={() => (connectorStore.restartingConnector = null)}
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
                        await this.refreshData(true);
                    }}
                />

                {/* Update Config */}
                <ConfirmModal<UpdatingConnectorData>
                    target={() => connectorStore.updatingConnector}
                    clearTarget={() => (connectorStore.updatingConnector = null)}
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
                        connectClustersState.getConnectorState(c);
                        connectClustersState.updateConnnector(c)
                        await this.refreshData(true);
                    }}
                />

                {/* Restart Task */}
                <ConfirmModal<RestartingTaskData>
                    target={() => connectorStore.restartingTask}
                    clearTarget={() => (connectorStore.restartingTask = null)}
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
                        await this.refreshData(true);
                    }}
                />

                {/* Delete Connector */}
                <ConfirmModal<string>
                    target={() => connectorStore.deletingConnector}
                    clearTarget={() => (connectorStore.deletingConnector = null)}
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
                    onOk={async (connectorName) => {
                        // await api.deleteConnector(clusterName, c);
                        await connectClustersState.deleteConnector({ clusterName, connectorName });
                        appGlobal.history.push(`/connect-clusters/${clusterName}`);
                        await this.refreshData(true);
                    }}
                />
            </PageContent>
        );
    }
}

export default KafkaConnectorDetails;

@observer
class TaskActionsColumn extends Component<{
    clusterName: string;
    connectorName: string;
    taskId: number;

    getRestartingTask: () => RestartingTaskData | null;
    setRestartingTask: (x: RestartingTaskData) => void;
}> {
    render() {
        const { clusterName, connectorName, taskId } = this.props;
        const restartingTask = this.props.getRestartingTask();

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
                        this.props.setRestartingTask({
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
}
