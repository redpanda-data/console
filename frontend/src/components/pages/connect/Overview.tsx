import { CheckCircleTwoTone, WarningTwoTone } from '@ant-design/icons';
import { CheckIcon, CircleSlashIcon, EyeClosedIcon } from '@primer/octicons-v2-react';
import { Checkbox, Col, Empty, Popover, Row, Statistic, Table } from 'antd';
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
import { ConnectorClass, connectorMetadata, StatisticsCard } from './helper';



@observer
class KafkaConnectOverview extends PageComponent {

    @observable placeholder = 5;

    constructor(p: any) {
        super(p);
        makeObservable(this);
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
        const settings = uiSettings.kafkaConnect;

        return (
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <StatisticsCard />

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

const okIcon = <CheckCircleTwoTone twoToneColor='#52c41a' />;
const warnIcon = <WarningTwoTone twoToneColor='orange' />;
const mr05: CSSProperties = { marginRight: '.5em' };


class TabClusters extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;

        return <KowlTable<ClusterConnectors>
            dataSource={clusters}
            columns={[
                { title: 'Name', dataIndex: 'clusterName', sorter: sortField('clusterName'), defaultSortOrder: 'ascend' },
                { title: 'Version', render: (_, r) => r.clusterInfo.version, sorter: sortField('clusterAddress') },
                {
                    width: 150,
                    title: 'Connectors', render: (_, r) => <>
                        <span style={mr05}>{r.runningConnectors} / {r.totalConnectors}</span>
                        {r.runningConnectors < r.totalConnectors ? warnIcon : okIcon}
                    </>
                },
                {
                    width: 150,
                    title: 'Tasks', render: (_, r) => {
                        const runningTasks = r.connectors.sum(x => x.runningTasks);
                        const totalTasks = r.connectors.sum(x => x.totalTasks);
                        return <>
                            <span style={mr05}>{runningTasks} / {totalTasks}</span>
                            {runningTasks < totalTasks ? warnIcon : okIcon}
                        </>
                    }
                },
            ]}
            search={{
                columnTitle: 'Name',
                isRowMatch: (row, regex) => {
                    const isMatch = regex.test(row.clusterName) || regex.test(row.clusterInfo.version);
                    return isMatch;
                },
            }}
            rowKey='clusterName'
        />
    }
}

class TabConnectors extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors = clusters.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c })));

        return <KowlTable
            dataSource={allConnectors}
            columns={[
                {
                    title: 'Connector', dataIndex: 'name',
                    render: (_, r) => (
                        <span className='hoverLink' onClick={() => appGlobal.history.push(`/kafka-connect/${r.cluster.clusterName}/${r.name}`)}>
                            {r.name}
                        </span>
                    ),
                    sorter: sortField('name'), defaultSortOrder: 'ascend'
                },
                {
                    title: 'Class', dataIndex: 'class',
                    render: (_, r) => <ConnectorClass connector={r} />
                },
                {
                    width: 100,
                    title: 'Type', dataIndex: 'type'
                },
                {
                    width: 120,
                    title: 'State', dataIndex: 'state'
                },
                {
                    width: 120,
                    title: 'Tasks', render: (_, c) => {
                        return <>
                            <span style={mr05}>{c.runningTasks} / {c.totalTasks}</span>
                            {c.runningTasks < c.totalTasks ? warnIcon : okIcon}
                        </>
                    }
                },
                { title: 'Cluster', render: (_, c) => <Code>{c.cluster.clusterName}</Code> },
            ]}
            search={{
                columnTitle: 'Connector',
                isRowMatch: (row, regex) => regex.test(row.name)
                    || regex.test(row.class)
                    || regex.test(row.type)
                    || regex.test(row.state)
                    || regex.test(row.cluster.clusterName),
            }}
            rowKey={r => r.cluster.clusterName + r.cluster.clusterAddress + r.name}

            className='connectorsTable'
        />
    }
}

class TabTasks extends Component {
    render() {
        const clusters = api.connectConnectors!.clusters;
        const allConnectors = clusters.flatMap(cluster => cluster.connectors.map(c => ({ cluster, ...c })));
        const allTasks = allConnectors.flatMap(con => con.tasks.map(task => ({ ...con, taskId: task.taskId, taskState: task.state, taskWorkerId: task.workerId })));

        return <KowlTable
            dataSource={allTasks}
            columns={[
                {
                    title: 'Connector', dataIndex: 'name', sorter: sortField('name'), defaultSortOrder: 'ascend',
                    render: (_, r) => (
                        <span className='hoverLink' onClick={() => appGlobal.history.push(`/kafka-connect/${r.cluster.clusterName}/${r.name}`)}>
                            {r.name}
                        </span>
                    )
                },
                { title: 'Task ID', dataIndex: 'taskId', sorter: sortField('taskId') },
                { title: 'State', dataIndex: 'taskState', sorter: sortField('taskState') },
                { title: 'Worker', dataIndex: 'taskWorkerId', sorter: sortField('taskWorkerId') },
                { title: 'Cluster', render: (_, c) => <Code>{c.cluster.clusterName}</Code> },
            ]}
            rowKey={r => r.cluster.clusterName + r.cluster.clusterAddress + r.name + r.taskId}
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
