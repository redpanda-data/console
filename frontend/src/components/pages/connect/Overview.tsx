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

import { CheckCircleTwoTone, WarningTwoTone } from '@ant-design/icons';
import {Button, Checkbox, Col, Empty, Popover, Row, Statistic, Table, Tooltip} from 'antd';
import { motion } from 'framer-motion';
import { autorun, IReactionDisposer, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import React, { Component, CSSProperties } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { TopicActions, Topic, ConnectClusterShard, ClusterConnectors, ClusterConnectorInfo } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { animProps } from '../../../utils/animationProps';
import { clone } from '../../../utils/jsonUtils';
import { editQuery } from '../../../utils/queryHelper';
import { Code, DefaultSkeleton, findPopupContainer, LayoutBypass, QuickTable } from '../../../utils/tsxUtils';
import { prettyBytesOrNA } from '../../../utils/utils';
import Card from '../../misc/Card';
import { makePaginationConfig, renderLogDirSummary, sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import SearchBar from '../../misc/SearchBar';
import Tabs, { Tab } from '../../misc/tabs/Tabs';
import { PageComponent, PageInitHelper } from '../Page';
import { ConnectorClass, ConnectorsColumn, errIcon, mr05, NotConfigured, OverviewStatisticsCard, TasksColumn, TaskState } from './helper';
import { Link } from 'react-router-dom';



@observer
class KafkaConnectOverview extends PageComponent {
    constructor(p: any) {
        super(p);
        // makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Overview';
        p.addBreadcrumb('Kafka Connect', '/kafka-connect');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshConnectClusters(force);
    }

    render() {
        if (!api.connectConnectors) return DefaultSkeleton;
        if (api.connectConnectors.isConfigured == false) return <NotConfigured />;
        const settings = uiSettings.kafkaConnect;

        return (
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <OverviewStatisticsCard />

                <Card>
                    <Tabs tabs={connectTabs}
                        onChange={x => settings.selectedTab}
                        selectedTabKey={settings.selectedTab}
                    />
                </Card>
            </motion.div>
        );
    }
}

export default KafkaConnectOverview;


@observer
class TabClusters extends Component {

    render() {
        const clusters = api.connectConnectors?.clusters;
        if (clusters == null) return null;

        return (<>
          <div style={{display: 'flex', marginBottom: "15px"}}><Link style={{marginLeft: 'auto'}} to={'/create-connector'}><Button type={'primary'}>Create Connector</Button></Link></div>

          <KowlTable<ClusterConnectors>
            dataSource={clusters}
            columns={[
                {
                    title: 'Cluster', dataIndex: 'clusterName',
                    render: (_, r) => {

                        if (r.error) {
                            return <Tooltip overlay={r.error} getPopupContainer={findPopupContainer}>
                                <span style={mr05}>{errIcon}</span>
                                {r.clusterName}
                            </Tooltip>
                        }

                        return <span className='hoverLink' style={{ display: 'inline-block', width: '100%' }}
                            onClick={() => appGlobal.history.push(`/kafka-connect/${r.clusterName}`)}>
                            {r.clusterName}
                        </span>
                    },
                    sorter: sortField('clusterName'), defaultSortOrder: 'ascend',
                },
                {
                    dataIndex: 'clusterAddress',
                    title: 'Version', render: (_, r) => r.clusterInfo.version, sorter: sortField('clusterAddress'),
                    filterType: { type: 'enum' },
                },
                {
                    dataIndex: 'connectors',
                    width: 150,
                    title: 'Connectors', render: (_, r) => <ConnectorsColumn observable={r} />
                },
                {
                    dataIndex: 'connectors',
                    width: 150,
                    title: 'Tasks', render: (_, r) => <TasksColumn observable={r} />
                },
            ]}
            search={{
                searchColumnIndex: 0,
                isRowMatch: (row, regex) => {
                    const isMatch = regex.test(row.clusterName) || regex.test(row.clusterInfo.version);
                    return isMatch;
                },
            }}
            observableSettings={uiSettings.kafkaConnect.clusters}
            pagination={{
                defaultPageSize: 10,
            }}
            rowKey='clusterName'
          />
        </>)
    }
}

@observer
class TabConnectors extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors = clusters?.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c })));

        return <KowlTable
            dataSource={allConnectors}
            columns={[
                {
                    title: 'Connector', dataIndex: 'name',
                    width: '35%',
                    render: (_, r) => (
                        <Tooltip placement="topLeft" title={r.name} getPopupContainer={findPopupContainer}>
                            <span className='hoverLink' style={{ display: 'inline-block', width: '100%' }}
                                onClick={() => appGlobal.history.push(`/kafka-connect/${r.cluster.clusterName}/${r.name}`)}>
                                {r.name}
                            </span>
                        </Tooltip>
                    ),
                    sorter: sortField('name'), defaultSortOrder: 'ascend'
                },
                {
                    title: 'Class', dataIndex: 'class',
                    render: (_, r) => <ConnectorClass observable={r} />,
                    sorter: sortField('class')
                },
                {
                    width: 100,
                    title: 'Type', dataIndex: 'type',
                    className: 'capitalize',
                    sorter: sortField('type'),
                    filterType: { type: 'enum', optionClassName: 'capitalize' },

                },
                {
                    width: 120,
                    title: 'State', dataIndex: 'state',
                    render: (_, r) => <TaskState observable={r} />,
                    sorter: sortField('state'),
                    filterType: { type: 'enum', optionClassName: 'capitalize', toDisplay: x => x ? String(x).toLowerCase() : '' },
                },
                {
                    width: 120,
                    title: 'Tasks', render: (_, c) => <TasksColumn observable={c} />
                },
                {
                    title: 'Cluster',
                    render: (_, c) => <Code nowrap>{c.cluster.clusterName}</Code>,
                    sorter: (a, b) => String(a.cluster.clusterName).localeCompare(String(b.cluster.clusterName))
                },
            ]}
            search={{
                searchColumnIndex: 0,
                isRowMatch: (row, regex) => regex.test(row.name)
                    || regex.test(row.class)
                    || regex.test(row.type)
                    || regex.test(row.state)
                    || regex.test(row.cluster.clusterName),
            }}
            rowKey={r => r.cluster.clusterName + r.cluster.clusterAddress + r.name}

            observableSettings={uiSettings.kafkaConnect.connectors}
            pagination={{
                defaultPageSize: 10,
            }}
            className='connectorsTable'
        />
    }
}

@observer
class TabTasks extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors = clusters?.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c })));
        const allTasks = allConnectors?.flatMap(con => con.tasks.map(task => {
            return {
                ...task,
                connector: con,
                cluster: con.cluster,

                connectorName: con.name,
            };
        }));

        return <KowlTable
            dataSource={allTasks}
            columns={[
                {
                    title: 'Connector', dataIndex: 'name',
                    width: '35%',
                    sorter: sortField('connectorName'), defaultSortOrder: 'ascend',
                    render: (_, r) => (
                        <span className='hoverLink' onClick={() => appGlobal.history.push(`/kafka-connect/${r.cluster.clusterName}/${r.connectorName}`)}>
                            {r.connectorName}
                        </span>
                    )
                },
                {
                    title: 'Task ID', dataIndex: 'taskId', sorter: sortField('taskId'),
                    width: 50,
                },
                {
                    title: 'State', dataIndex: 'state',
                    render: (_, r) => <TaskState observable={r} />,
                    sorter: sortField('state'),
                    filterType: { type: 'enum', optionClassName: 'capitalize', toDisplay: x => String(x).toLowerCase() },
                },
                {
                    title: 'Worker', dataIndex: 'workerId', sorter: sortField('workerId'),
                    filterType: { type: 'enum' },
                },
                {
                    title: 'Cluster',
                    render: (_, c) => <Code nowrap>{c.cluster.clusterName}</Code>
                },
            ]}
            rowKey={r => r.cluster.clusterName + r.cluster.clusterAddress + r.connectorName + r.taskId}

            search={{
                searchColumnIndex: 0,
                isRowMatch: (row, regex) => regex.test(row.connectorName)
                    || regex.test(String(row.taskId))
                    || regex.test(row.state)
                    || regex.test(row.workerId)
                    || regex.test(row.cluster.clusterName)
            }}

            observableSettings={uiSettings.kafkaConnect.tasks}
            pagination={{
                defaultPageSize: 10,
            }}
            className='tasksTable'
        />
    }
}

export type ConnectTabKeys = 'clusters' | 'connectors' | 'tasks';
const connectTabs: Tab[] = [
    { key: 'clusters', title: 'Clusters', content: <TabClusters /> },
    { key: 'connectors', title: 'Connectors', content: <TabConnectors /> },
    { key: 'tasks', title: 'Tasks', content: <TabTasks /> },
];

