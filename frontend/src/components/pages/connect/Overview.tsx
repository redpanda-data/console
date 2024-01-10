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

import { observer } from 'mobx-react';
import { Component } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { ClusterConnectorInfo, ClusterConnectors, ClusterConnectorTaskInfo } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { Code, DefaultSkeleton } from '../../../utils/tsxUtils';
import Tabs, { Tab } from '../../misc/tabs/Tabs';
import { PageComponent, PageInitHelper } from '../Page';
import { ConnectorClass, ConnectorsColumn, errIcon, mr05, NotConfigured, OverviewStatisticsCard, TasksColumn, TaskState } from './helper';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { DataTable, Tooltip } from '@redpanda-data/ui';

@observer
class KafkaConnectOverview extends PageComponent {
    initPage(p: PageInitHelper): void {
        p.title = 'Overview';
        p.addBreadcrumb('Connectors', '/connect-clusters');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    async refreshData(force: boolean) {
        await api.refreshConnectClusters(force);
        if (api.connectConnectors?.isConfigured) {
            const clusters = api.connectConnectors.clusters;
            if (clusters?.length == 1) {
                const cluster = clusters[0];
                appGlobal.history.replace(`/connect-clusters/${cluster.clusterName}`);
            }
        }
    }

    render() {
        if (!api.connectConnectors) return DefaultSkeleton;
        if (api.connectConnectors.isConfigured == false) return <NotConfigured />;
        const settings = uiSettings.kafkaConnect;

        return (
            <PageContent>
                <OverviewStatisticsCard />

                <Section>
                    <Tabs tabs={connectTabs} onChange={() => settings.selectedTab} selectedTabKey={settings.selectedTab} />
                </Section>
            </PageContent>
        );
    }
}

export default KafkaConnectOverview;

@observer
class TabClusters extends Component {
    render() {
        const clusters = api.connectConnectors?.clusters;
        if (clusters == null) return null;

        return (
            <DataTable<ClusterConnectors>
                data={clusters}
                size="sm"
                enableSorting={false}
                columns={[
                    {
                        header: 'Cluster',
                        accessorKey: 'clusterName',
                        size: Infinity,
                        cell: ({row: {original: r}}) => {
                            if (r.error) {
                                return (
                                    <Tooltip label={r.error} placement="top" hasArrow={true}>
                                        <span style={mr05}>{errIcon}</span>
                                        {r.clusterName}
                                    </Tooltip>
                                );
                            }

                            return (
                                <span className="hoverLink" style={{display: 'inline-block', width: '100%'}} onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(r.clusterName)}`)}>
                                        {r.clusterName}
                                    </span>
                            );
                        },
                    },
                    {
                        accessorKey: 'clusterAddress',
                        header: 'Version',
                        cell: ({row: {original}}) => original.clusterInfo.version,
                    },
                    {
                        accessorKey: 'connectors',
                        size: 150,
                        header: 'Connectors',
                        cell: ({row: {original}}) => <ConnectorsColumn observable={original}/>
                    },
                    {
                        accessorKey: 'connectors',
                        size: 150,
                        header: 'Tasks',
                        cell: ({row: {original}}) => <TasksColumn observable={original}/>
                    }
                ]}
            />
        );
    }
}


interface ConnectorType extends ClusterConnectorInfo {
    cluster: ClusterConnectors
}

@observer
class TabConnectors extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors: ConnectorType[] = clusters?.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c }))) ?? [];

        return (
            <DataTable<ConnectorType>
                data={allConnectors}
                size="sm"
                enableSorting={false}
                columns={[
                    {
                        header: 'Connector',
                        accessorKey: 'name',
                        size: 35, // Assuming '35%' is approximated to '35'
                        cell: ({ row: { original } }) => (
                            <Tooltip placement="top" label={original.name} hasArrow={true}>
                <span className="hoverLink" style={{ display: 'inline-block', width: '100%' }} onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.name)}`)}>
                    {original.name}
                </span>
                            </Tooltip>
                        )
                    },
                    {
                        header: 'Class',
                        accessorKey: 'class',
                        cell: ({ row: { original } }) => <ConnectorClass observable={original} />
                    },
                    {
                        header: 'Type',
                        accessorKey: 'type',
                        size: 100,
                    },
                    {
                        header: 'State',
                        accessorKey: 'state',
                        size: 120,
                        cell: ({ row: { original } }) => <TaskState observable={original} />
                    },
                    {
                        header: 'Tasks',
                        size: 120,
                        cell: ({ row: { original } }) => <TasksColumn observable={original} />
                    },
                    {
                        header: 'Cluster',
                        cell: ({ row: { original } }) => <Code nowrap>{original.cluster.clusterName}</Code>
                    }
                ]}
            />
        );
    }
}

interface TaskType extends ClusterConnectorTaskInfo {
    connector: ConnectorType;
    cluster: ClusterConnectors;
    connectorName: string;
}

@observer
class TabTasks extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors: ConnectorType[] = clusters?.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c }))) ?? [];
        const allTasks: TaskType[] = allConnectors.flatMap(con =>
            con.tasks.map(task => {
                return {
                    ...task,
                    connector: con,
                    cluster: con.cluster,

                    connectorName: con.name
                };
            })
        );

        return (
            <DataTable<TaskType>
                data={allTasks}
                columns={[
                    {
                        header: 'Connector',
                        accessorKey: 'name', // Assuming 'name' is correct based on your initial dataIndex
                        cell: ({ row: { original } }) => (
                            <span className="hoverLink" onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(original.cluster.clusterName)}/${encodeURIComponent(original.connectorName)}`)}>
                {original.connectorName}
            </span>
                        ),
                        size: 300
                    },
                    {
                        header: 'Task ID',
                        accessorKey: 'taskId',
                        size: 50
                    },
                    {
                        header: 'State',
                        accessorKey: 'state',
                        cell: ({ row: { original } }) => <TaskState observable={original} />,
                    },
                    {
                        header: 'Worker',
                        accessorKey: 'workerId',
                    },
                    {
                        header: 'Cluster',
                        cell: ({ row: { original } }) => <Code nowrap>{original.cluster.clusterName}</Code>
                    }
                ]}
            />
        );
    }
}

export type ConnectTabKeys = 'clusters' | 'connectors' | 'tasks';
const connectTabs: Tab[] = [
    { key: 'clusters', title: 'Clusters', content: <TabClusters /> },
    { key: 'connectors', title: 'Connectors', content: <TabConnectors /> },
    { key: 'tasks', title: 'Tasks', content: <TabTasks /> }
];
