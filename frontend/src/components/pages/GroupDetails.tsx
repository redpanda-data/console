import React, { Component } from "react";
import { Table, Row, Statistic, Skeleton, Tag, Badge, Typography, Tree, Button, List, Collapse, Col, Checkbox, Card as AntCard, Input, Space, Tooltip } from "antd";
import { observer } from "mobx-react";

import { api } from "../../state/backendApi";
import { PageComponent, PageInitHelper } from "./Page";
import { makePaginationConfig, sortField } from "../misc/common";
import { MotionDiv } from "../../utils/animationProps";
import { GroupDescription, GroupMemberDescription, GroupMemberAssignment, TopicLag } from "../../state/restInterfaces";
import { groupConsecutive } from "../../utils/utils";
import { observable, autorun } from "mobx";
import { appGlobal } from "../../state/appGlobal";
import Card from "../misc/Card";
import Icon, { FireOutlined, WarningTwoTone, HourglassTwoTone, FireTwoTone, CheckCircleTwoTone } from '@ant-design/icons';
import { Radio } from 'antd';
import { TablePaginationConfig } from "antd/lib/table";
import Octicon, { Skip } from "@primer/octicons-react";


@observer
class GroupDetails extends PageComponent<{ groupId: string }> {
    @observable viewMode: 'topic' | 'member' = 'topic';
    @observable onlyShowPartitionsWithLag: boolean = false;

    initPage(p: PageInitHelper): void {
        const group = this.props.groupId;

        p.title = this.props.groupId;
        p.addBreadcrumb('Consumer Groups', '/groups');
        if (group) p.addBreadcrumb(group, '/' + group);

        this.refreshData(false);

        // autorun(() => {
        //     if (api.ConsumerGroups)
        //         for (let g of api.ConsumerGroups)
        //             console.log(g.groupId + ': ' + g.lag.topicLags.sum(l => l.partitionLags.sum(x => x.lag)));
        // });

        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        console.log('GroupDetails.Refresh()');
        api.refreshConsumerGroups(force);
        api.refreshTopics(force); // we also need the topics, so we know how many partitions each topic has
    };

    render() {
        // Get info about the group
        const groupName = this.props.groupId;
        if (!api.ConsumerGroups) return this.skeleton;
        const group = api.ConsumerGroups.find(e => e.groupId == groupName);
        if (!group) return this.skeleton;
        if (!api.Topics) return this.skeleton;

        // Get info about each topic
        const requiredTopics = group.members.flatMap(m => m.assignments.map(a => a.topicName)).distinct();
        let allDataLoaded = true;
        for (const topicName of requiredTopics) {
            if (api.Topics.find(t => t.topicName == topicName) == undefined) {
                console.log('waiting for topic details of "' + topicName + '"...');
                setTimeout(() => api.refreshTopics(), 1);
                allDataLoaded = false;
            }
            if (!api.TopicPartitions.has(topicName)) {
                console.log('waiting for partitions of topic "' + topicName + '"...');
                setTimeout(() => api.refreshTopicPartitions(topicName), 1);
                allDataLoaded = false;
            }
        }
        if (!allDataLoaded)
            return this.skeleton;


        const totalPartitions = group.members.flatMap(m => m.assignments).sum(a => a.partitionIds.length);
        const partitionsWithOffset = group.lag.topicLags.sum(tl => tl.partitionsWithOffset);
        const topicsWithOffset = group.lag.topicLags.length;

        return (
            <MotionDiv style={{ margin: '0 1rem' }}>
                {/* States can be: Dead, Initializing, Rebalancing, Stable */}
                <Card>
                    <Row >
                        <Statistic title='State' valueRender={() => <GroupState group={group} />} />
                        <ProtocolType group={group} />
                        <Statistic title='Members' value={group.members.length} />
                        <Statistic title='Assigned Topics' value={requiredTopics.length} />
                        <Statistic title='Topics with offset' value={topicsWithOffset} />
                        <Statistic title='Assigned Partitions' value={totalPartitions} />
                        <Statistic title='Partitions with offset' value={partitionsWithOffset} />
                    </Row>
                </Card>

                <Card>
                    {/* Settings: GroupBy, Partitions */}
                    <Space style={{ margin: '.5rem 0 1rem 0' }} size='large'>
                        <span>
                            View:
                            <Radio.Group value={this.viewMode} onChange={e => this.viewMode = e.target.value} style={{ marginLeft: '.5rem' }}>
                                <Radio.Button value="member">Members</Radio.Button>
                                <Radio.Button value="topic">Topics</Radio.Button>
                            </Radio.Group>
                        </span>
                        <span>
                            Partitions:
                            <Radio.Group value={this.onlyShowPartitionsWithLag} onChange={e => this.onlyShowPartitionsWithLag = e.target.value} style={{ marginLeft: '.5rem' }}>
                                <Radio.Button value={false}>All</Radio.Button>
                                <Radio.Button value={true}>With Lag</Radio.Button>
                            </Radio.Group>
                        </span>
                    </Space>

                    {this.viewMode == 'member'
                        ? <GroupByMembers group={group} onlyShowPartitionsWithLag={this.onlyShowPartitionsWithLag} />
                        : <GroupByTopics group={group} onlyShowPartitionsWithLag={this.onlyShowPartitionsWithLag} />
                    }

                </Card>
            </MotionDiv>
        );
    }

    skeleton = <MotionDiv identityKey='loader' style={{ margin: '2rem' }}>
        <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
    </MotionDiv>
}


@observer
class GroupByTopics extends Component<{ group: GroupDescription, onlyShowPartitionsWithLag: boolean }>{

    pageConfig: TablePaginationConfig;
    topicLags: TopicLag[];

    constructor(props: any) {
        super(props);
        this.pageConfig = makePaginationConfig(30);
        this.pageConfig.hideOnSinglePage = true;
        this.pageConfig.showSizeChanger = false;
        this.topicLags = this.props.group.lag.topicLags;
    }

    render() {
        const p = this.props;
        const allAssignments = p.group.members
            .flatMap(m => m.assignments
                .map(as => ({ member: m, topicName: as.topicName, partitions: as.partitionIds })));

        const lagsFlat = this.topicLags.flatMap(topicLag =>
            topicLag.partitionLags.map(partLag => {

                const assignedMember = allAssignments.find(e =>
                    e.topicName == topicLag.topic
                    && e.partitions.includes(partLag.partitionId));

                return {
                    topicName: topicLag.topic,
                    partitionId: partLag.partitionId,
                    lag: partLag.lag,

                    assignedMember: assignedMember?.member,
                    id: assignedMember?.member.id,
                    clientId: assignedMember?.member.clientId,
                    host: assignedMember?.member.clientHost
                }
            }));

        const lagGroupsByTopic = lagsFlat.groupInto(e => e.topicName);

        const topicEntries = lagGroupsByTopic.map(g => {
            const topicPartitionInfo = api.TopicPartitions.get(g.key);
            const totalLagAssigned = g.items.filter(c => c.assignedMember).sum(c => c.lag ?? 0);
            const totalLagAll = g.items.sum(c => c.lag ?? 0);
            const partitionsAssigned = g.items.filter(c => c.assignedMember).length;

            if (p.onlyShowPartitionsWithLag)
                g.items.removeAll(e => e.lag == 0);

            return <Collapse.Panel key={g.key}
                header={
                    <div>
                        <span style={{ fontWeight: 600, fontSize: '1.1em' }}>{g.key}</span>
                        <Tooltip placement='top' title='Summed lag of all partitions of the topic' mouseEnterDelay={0}>
                            <Tag style={{ marginLeft: '1em' }} color='blue'>lag: {totalLagAll}</Tag>
                        </Tooltip>
                        {/* <Tooltip placement='top' title='Number of partitions assigned / Number of partitions in the topic' mouseEnterDelay={0}>
                                <Tag color='blue'>partitions: {partitionCount}/{topicPartitionInfo?.length}</Tag>
                            </Tooltip> */}
                        <Tooltip placement='top' title='Number of assigned partitions' mouseEnterDelay={0}>
                            <Tag color='blue'>assigned partitions: {partitionsAssigned}</Tag>
                        </Tooltip>
                    </div>
                }>

                <Table
                    size='small'
                    pagination={this.pageConfig}
                    dataSource={g.items}
                    rowKey={r => r.partitionId}
                    rowClassName={(r) => (r.assignedMember) ? '' : 'consumerGroupNoMemberAssigned'}
                    columns={[
                        { width: 100, title: 'Partition', dataIndex: 'partitionId', sorter: sortField('partitionId'), defaultSortOrder: 'ascend' },
                        { width: 'auto', title: 'Assigned Member', dataIndex: 'id', render: (t, r) => t ?? <span style={{ opacity: 0.66, margin: '0 3px' }}><Octicon icon={Skip} /> no assigned member</span> },
                        { width: 'auto', title: 'Host', dataIndex: 'host', sorter: sortField('host') },
                        { width: 80, title: 'Lag', dataIndex: 'lag', sorter: sortField('lag') },
                    ]}
                />
            </Collapse.Panel>
        });

        const defaultExpand = lagGroupsByTopic.length == 1
            ? lagGroupsByTopic[0].key // only one -> expand
            : undefined; // more than one -> collapse

        return <Collapse bordered={false} defaultActiveKey={defaultExpand}>{topicEntries}</Collapse>;
    }
}

@observer
class GroupByMembers extends Component<{ group: GroupDescription, onlyShowPartitionsWithLag: boolean }>{

    pageConfig: TablePaginationConfig;
    topicLags: TopicLag[];

    constructor(props: any) {
        super(props);
        this.pageConfig = makePaginationConfig(30);
        this.pageConfig.hideOnSinglePage = true;
        this.pageConfig.showSizeChanger = false;
        this.topicLags = this.props.group.lag.topicLags;
    }

    render() {
        const p = this.props;

        const memberEntries = p.group.members.map((m, i) => {
            const assignments = m.assignments;

            const assignmentsFlat = assignments
                .map(a => a.partitionIds.map(id => {
                    const topicLag = this.topicLags.find(t => t.topic == a.topicName);
                    const partLag = topicLag?.partitionLags.find(p => p.partitionId == id)?.lag;
                    return {
                        topicName: a.topicName,
                        partitionId: id,
                        partitionLag: partLag ?? 0,
                    }
                })).flat();

            const totalLag = assignmentsFlat.sum(t => t.partitionLag ?? 0);
            const totalPartitions = assignmentsFlat.length;

            if (p.onlyShowPartitionsWithLag)
                assignmentsFlat.removeAll(e => !e.partitionLag);

            return <Collapse.Panel key={m.id}
                header={
                    <div>
                        <span style={{ fontWeight: 600, fontSize: '1.1em' }}>{renderMergedID(m)}</span>
                        <Tooltip placement='top' title='Host of the member' mouseEnterDelay={0}>
                            <Tag style={{ marginLeft: '1em' }} color='blue'>host: {m.clientHost}</Tag>
                        </Tooltip>
                        <Tooltip placement='top' title='Number of assigned partitions' mouseEnterDelay={0}>
                            <Tag color='blue'>partitions: {totalPartitions}</Tag>
                        </Tooltip>
                        <Tooltip placement='top' title='Summed lag over all assigned partitions of all topics' mouseEnterDelay={0}>
                            <Tag color='blue'>lag: {totalLag}</Tag>
                        </Tooltip>
                    </div>
                }>

                <Table
                    size='small'
                    pagination={this.pageConfig}
                    dataSource={assignmentsFlat}
                    rowKey={r => r.topicName + r.partitionId}
                    columns={[
                        { width: 'auto', title: 'Topic', dataIndex: 'topicName', sorter: sortField('topicName') },
                        { width: 150, title: 'Partition', dataIndex: 'partitionId', sorter: sortField('partitionId') },
                        { width: 150, title: 'Lag', dataIndex: 'partitionLag', sorter: sortField('partitionLag'), defaultSortOrder: 'descend' },
                    ]}
                />
            </Collapse.Panel>
        });

        const defaultExpand = p.group.members.length == 1
            ? p.group.members[0].id // if only one entry, expand it
            : undefined; // more than one -> collapse

        return <Collapse bordered={false} defaultActiveKey={defaultExpand}>{memberEntries}</Collapse>;
    }
}



const renderMergedID = (record: GroupMemberDescription) => {
    if (record.id.startsWith(record.clientId)) { // should always be true...
        const suffix = record.id.substring(record.clientId.length);
        return <span className='consumerGroupCompleteID'>
            <span className='consumerGroupName'>{record.clientId}</span>
            <span className='consumerGroupSuffix'>{suffix}</span>
        </span>
    }
};



const stateIcons = new Map<string, JSX.Element>([
    ['dead', <FireTwoTone twoToneColor='orangered' />],
    ['preparingrebalance', <HourglassTwoTone twoToneColor='orange' />],
    ['empty', <WarningTwoTone twoToneColor='orange' />],
    ['stable', <CheckCircleTwoTone twoToneColor='#52c41a' />],
]);
export const GroupState = (p: { group: GroupDescription }) => {
    const state = p.group.state.toLowerCase();
    const icon = stateIcons.get(state);
    // todo...
    return <>
        {icon}
        <span> {p.group.state}</span>
    </>
}
const ProtocolType = (p: { group: GroupDescription }) => {
    const protocol = p.group.protocolType;
    if (protocol == 'consumer') return null;

    return <Statistic title='Protocol' value={protocol} />
}

export default GroupDetails;
