import { CheckCircleTwoTone, WarningTwoTone } from '@ant-design/icons';
import { CheckIcon, CircleSlashIcon, EyeClosedIcon } from '@primer/octicons-v2-react';
import { Checkbox, Col, Empty, Popover, Row, Statistic, Table } from 'antd';
import { motion } from 'framer-motion';
import { autorun, IReactionDisposer, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import React, { Component, CSSProperties } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { TopicActions, Topic, ConnectClusterShard, ListConnectorsExpanded } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { animProps } from '../../../utils/animationProps';
import { clone } from '../../../utils/jsonUtils';
import { editQuery } from '../../../utils/queryHelper';
import { Code, DefaultSkeleton, QuickTable } from '../../../utils/tsxUtils';
import { prettyBytesOrNA } from '../../../utils/utils';
import Card from '../../misc/Card';
import { makePaginationConfig, renderLogDirSummary, sortField } from '../../misc/common';
import { KowlTable } from '../../misc/KowlTable';
import SearchBar from '../../misc/SearchBar';
import Tabs, { Tab } from '../../misc/tabs/Tabs';
import { PageComponent, PageInitHelper } from '../Page';



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
        api.refreshConnectors(undefined, force);
    }

    render() {
        const settings = uiSettings.kafkaConnect;

        const taskStats = api.connectClusters?.clusterShards.reduce((p, c) => ({
            running: p.running + c.runningTasks,
            total: p.total + c.totalTasks,
        }), { running: 0, total: 0 });

        return (
            <motion.div {...animProps} style={{ margin: '0 1rem' }}>
                <Card>
                    <div style={{ display: 'flex', gap: '1em' }}>
                        <Statistic title="Connect Clusters" value={api.connectClusters?.clusterShards.length} />
                        <Statistic title="Tasks" value={`${taskStats?.running} / ${taskStats?.total}`} />
                    </div>
                </Card>

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

type ClusterConnector = ListConnectorsExpanded & { clusterName: string, connectorName: string };

class TabClusters extends Component {
    render() {
        return <KowlTable<ConnectClusterShard>
            dataSource={api.connectClusters?.clusterShards}
            columns={[
                { title: 'Name', dataIndex: 'clusterName', sorter: sortField('clusterName'), defaultSortOrder: 'ascend' },
                { title: 'Version', render: (_, r) => r.clusterInfo.version, sorter: sortField('clusterAddress') },
                {
                    title: 'Connectors', render: (_, r) => <>
                        <span style={mr05}>{r.runningConnectors} / {r.totalConnectors}</span>
                        {r.runningConnectors < r.totalConnectors ? warnIcon : okIcon}
                    </>
                },
                {
                    title: 'Tasks', render: (_, r) => <>
                        <span style={mr05}>{r.runningTasks} / {r.totalTasks}</span>
                        {r.runningTasks < r.totalTasks ? warnIcon : okIcon}
                    </>
                },
            ]}
        />
    }
}

class TabConnectors extends Component {
    render() {
        // const allConnectors: ClusterConnector[] = [];
        // if(api.connectClusterConnectors){
        //     for(const [_, connectorsByName] of api.connectClusterConnectors)
        //         for(const [connectorName, connector] of connectorsByName)
        //             allConnectors.push({ ...connector, clusterName: connec })
        // }

        return <KowlTable<ClusterConnector>
            dataSource={[]}
            columns={[
                { title: 'Connector', dataIndex: 'connectorName', sorter: sortField('clusterName'), defaultSortOrder: 'ascend' },
                { title: 'Class', dataIndex: 'class' },
                { title: 'Type', dataIndex: 'type' },
                { title: 'State', dataIndex: 'state' },
                { title: 'Tasks', },
                { title: 'Cluster', dataIndex: 'clusterName', render: x => <Code>{x}</Code> },
            ]}
            rowKey={r => r.clusterName + r.connectorName}
        />
    }
}

class TabTasks extends Component {
    render() {
        return <KowlTable<ClusterConnector>
            dataSource={[]}
            columns={[
                { title: 'Connector', dataIndex: 'connectorName', sorter: sortField('clusterName'), defaultSortOrder: 'ascend' },
                { title: 'Task ID', dataIndex: 'id' },
                { title: 'State', },
                { title: 'Worker', },
                { title: 'Cluster', dataIndex: 'clusterName', render: x => <Code>{x}</Code> },
            ]}
            rowKey={r => r.clusterName + r.connectorName}
        />
    }
}

export type ConnectTabKeys = 'clusters' | 'connectors' | 'tasks';
const connectTabs: Tab[] = [
    { key: 'clusters', title: 'Clusters', content: <TabClusters /> },
    { key: 'connectors', title: 'Connectors', content: <TabConnectors /> },
    { key: 'tasks', title: 'Tasks', content: <TabTasks /> },
];
