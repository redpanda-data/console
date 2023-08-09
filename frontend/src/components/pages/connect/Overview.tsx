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
import { ClusterConnectors } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { Code, DefaultSkeleton, findPopupContainer } from '../../../utils/tsxUtils';
import { sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import Tabs, { Tab } from '../../misc/tabs/Tabs';
import { PageComponent, PageInitHelper } from '../Page';
import { ConnectorClass, ConnectorsColumn, errIcon, mr05, NotConfigured, OverviewStatisticsCard, TasksColumn, TaskState } from './helper';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Tooltip } from '@redpanda-data/ui';

@observer
class KafkaConnectOverview extends PageComponent {
    initPage(p: PageInitHelper): void {
        p.title = 'Overview';
        p.addBreadcrumb('Connectors', '/connect-clusters');

        this.refreshData(false);
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
            <>
                <KowlTable<ClusterConnectors>
                    dataSource={clusters}
                    columns={[
                        {
                            title: 'Cluster',
                            dataIndex: 'clusterName',
                            render: (_, r) => {
                                if (r.error) {
                                    return (
                                        <Tooltip label={r.error} placement="top" hasArrow={true}>
                                            <span style={mr05}>{errIcon}</span>
                                            {r.clusterName}
                                        </Tooltip>
                                    );
                                }

                                return (
                                    <span className="hoverLink" style={{ display: 'inline-block', width: '100%' }} onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(r.clusterName)}`)}>
                                        {r.clusterName}
                                    </span>
                                );
                            },
                            sorter: sortField('clusterName'),
                            defaultSortOrder: 'ascend'
                        },
                        {
                            dataIndex: 'clusterAddress',
                            title: 'Version',
                            render: (_, r) => r.clusterInfo.version,
                            sorter: sortField('clusterAddress'),
                            filterType: { type: 'enum' }
                        },
                        {
                            dataIndex: 'connectors',
                            width: 150,
                            title: 'Connectors',
                            render: (_, r) => <ConnectorsColumn observable={r} />
                        },
                        {
                            dataIndex: 'connectors',
                            width: 150,
                            title: 'Tasks',
                            render: (_, r) => <TasksColumn observable={r} />
                        }
                    ]}
                    search={{
                        searchColumnIndex: 0,
                        isRowMatch: (row, regex) => {
                            const isMatch = regex.test(row.clusterName) || regex.test(row.clusterInfo.version);
                            return isMatch;
                        }
                    }}
                    observableSettings={uiSettings.kafkaConnect.clusters}
                    pagination={{
                        defaultPageSize: 10
                    }}
                    rowKey="clusterName"
                />
            </>
        );
    }
}

@observer
class TabConnectors extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors = clusters?.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c })));

        return (
            <KowlTable
                dataSource={allConnectors}
                columns={[
                    {
                        title: 'Connector',
                        dataIndex: 'name',
                        width: '35%',
                        render: (_, r) => (
                            <Tooltip placement="top" label={r.name} hasArrow={true}>
                                <span className="hoverLink" style={{ display: 'inline-block', width: '100%' }} onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(r.cluster.clusterName)}/${encodeURIComponent(r.name)}`)}>
                                    {r.name}
                                </span>
                            </Tooltip>
                        ),
                        sorter: sortField('name'),
                        defaultSortOrder: 'ascend'
                    },
                    {
                        title: 'Class',
                        dataIndex: 'class',
                        render: (_, r) => <ConnectorClass observable={r} />,
                        sorter: sortField('class')
                    },
                    {
                        width: 100,
                        title: 'Type',
                        dataIndex: 'type',
                        className: 'capitalize',
                        sorter: sortField('type'),
                        filterType: { type: 'enum', optionClassName: 'capitalize' }
                    },
                    {
                        width: 120,
                        title: 'State',
                        dataIndex: 'state',
                        render: (_, r) => <TaskState observable={r} />,
                        sorter: sortField('state'),
                        filterType: { type: 'enum', optionClassName: 'capitalize', toDisplay: x => (x ? String(x).toLowerCase() : '') }
                    },
                    {
                        width: 120,
                        title: 'Tasks',
                        render: (_, c) => <TasksColumn observable={c} />
                    },
                    {
                        title: 'Cluster',
                        render: (_, c) => <Code nowrap>{c.cluster.clusterName}</Code>,
                        sorter: (a, b) => String(a.cluster.clusterName).localeCompare(String(b.cluster.clusterName))
                    }
                ]}
                search={{
                    searchColumnIndex: 0,
                    isRowMatch: (row, regex) => regex.test(row.name) || regex.test(row.class) || regex.test(row.type) || regex.test(row.state) || regex.test(row.cluster.clusterName)
                }}
                rowKey={r => r.cluster.clusterName + r.cluster.clusterAddress + r.name}
                observableSettings={uiSettings.kafkaConnect.connectors}
                pagination={{
                    defaultPageSize: 10
                }}
                className="connectorsTable"
            />
        );
    }
}

@observer
class TabTasks extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors = clusters?.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c })));
        const allTasks = allConnectors?.flatMap(con =>
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
            <KowlTable
                dataSource={allTasks}
                columns={[
                    {
                        title: 'Connector',
                        dataIndex: 'name',
                        width: '35%',
                        sorter: sortField('connectorName'),
                        defaultSortOrder: 'ascend',
                        render: (_, r) => (
                            <span className="hoverLink" onClick={() => appGlobal.history.push(`/connect-clusters/${encodeURIComponent(r.cluster.clusterName)}/${encodeURIComponent(r.connectorName)}`)}>
                                {r.connectorName}
                            </span>
                        )
                    },
                    {
                        title: 'Task ID',
                        dataIndex: 'taskId',
                        sorter: sortField('taskId'),
                        width: 50
                    },
                    {
                        title: 'State',
                        dataIndex: 'state',
                        render: (_, r) => <TaskState observable={r} />,
                        sorter: sortField('state'),
                        filterType: { type: 'enum', optionClassName: 'capitalize', toDisplay: x => String(x).toLowerCase() }
                    },
                    {
                        title: 'Worker',
                        dataIndex: 'workerId',
                        sorter: sortField('workerId'),
                        filterType: { type: 'enum' }
                    },
                    {
                        title: 'Cluster',
                        render: (_, c) => <Code nowrap>{c.cluster.clusterName}</Code>
                    }
                ]}
                rowKey={r => r.cluster.clusterName + r.cluster.clusterAddress + r.connectorName + r.taskId}
                search={{
                    searchColumnIndex: 0,
                    isRowMatch: (row, regex) => regex.test(row.connectorName) || regex.test(String(row.taskId)) || regex.test(row.state) || regex.test(row.workerId) || regex.test(row.cluster.clusterName)
                }}
                observableSettings={uiSettings.kafkaConnect.tasks}
                pagination={{
                    defaultPageSize: 10
                }}
                className="tasksTable"
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
