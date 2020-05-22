import React, { Component } from "react";
import { Table, Row, Statistic, Skeleton, Tag, Badge, Typography, Tree, Button, List, Collapse, Col, Checkbox, Card as AntCard, Input, Space } from "antd";
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


        const totalPartitions = group.members.flatMap(m => m.assignments).map(a => a.partitionIds.length).reduce((prev, cur) => prev + cur);

        return (
            <MotionDiv style={{ margin: '0 1rem' }}>
                {/* States can be: Dead, Initializing, Rebalancing, Stable */}
                <Card>
                    <Row >
                        <Statistic title='State' valueRender={() => <GroupState group={group} />} />
                        <ProtocolType group={group} />
                        <Statistic title='Consumers' value={group.members.length} />
                        <Statistic title='Topics' value={requiredTopics.length} />
                        <Statistic title='Consumed Partitions' value={totalPartitions} />
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

        const lagsFlat = this.topicLags.flatMap(topicLag => topicLag.partitionLags.map(partLag => {
            const a = p.group.members.flatMap(m => m.assignments.map(as => ({ member: m, assignment: as })));

            const assignedMember = a.find(e =>
                e.assignment.topicName == topicLag.topic
                && e.assignment.partitionIds.includes(partLag.partitionId));

            return {
                topicName: topicLag.topic,
                partitionId: partLag.partitionId,
                lag: partLag.lag,
                assignedMember: assignedMember?.member,
                assignment: assignedMember?.assignment,

                clientId: assignedMember?.member.clientId,
                host: assignedMember?.member.clientHost
            }
        }));

        const lagGroupsByTopic = lagsFlat.groupInto(e => e.topicName);

        const topicEntries = lagGroupsByTopic.map(g => {
            const topicPartitionInfo = api.TopicPartitions.get(g.key);
            const totalLag = g.items.sum(c => c.lag ?? 0);
            const partitionCount = g.items.length;

            if (p.onlyShowPartitionsWithLag)
                g.items.removeAll(e => e.lag == 0);

            return <div key={g.key}>
                <div style={{ margin: '.5em' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '110%' }}>{g.key}</span>
                    <Tag style={{ marginLeft: '1em' }} color='blue'>lag: {totalLag}</Tag>
                    <Tag color='blue'>partitions: {partitionCount}/{topicPartitionInfo?.length}</Tag>
                </div>
                <Table
                    size='small'
                    pagination={this.pageConfig}
                    dataSource={g.items}
                    rowKey={r => r.partitionId}
                    columns={[
                        { width: 150, title: 'Partition', dataIndex: 'partitionId', sorter: sortField('partitionId'), defaultSortOrder: 'ascend' },
                        { width: 'auto', title: 'Assigned Member', dataIndex: 'clientId' },
                        { width: 'auto', title: 'Host', dataIndex: 'host', sorter: sortField('host') },
                        { width: 150, title: 'Lag', dataIndex: 'lag', sorter: sortField('lag') },
                    ]}
                />
            </div>
        });

        return <>{topicEntries}</>;
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
                        partitionLag: partLag,
                    }
                })).flat();

            const totalLag = assignmentsFlat.sum(t => t.partitionLag ?? 0);
            const totalPartitions = assignmentsFlat.length;

            if (p.onlyShowPartitionsWithLag)
                assignmentsFlat.removeAll(e => !e.partitionLag);

            return <div key={m.id}>
                <div style={{ margin: '.5em' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '110%', marginRight: '1em' }}>{renderMergedID(m)}</span>
                    <Tag color='blue'>lag: {totalLag}</Tag>
                    <Tag color='blue'>partitions: {totalPartitions}</Tag>
                    <Tag color='blue'>host: {m.clientHost}</Tag>
                </div>
                <Table
                    size='small'
                    pagination={this.pageConfig}
                    dataSource={assignmentsFlat}
                    rowKey={r => r.topicName + r.partitionId}
                    columns={[
                        { width: 'auto', title: 'Topic', dataIndex: 'topicName', },
                        { width: 150, title: 'Partition', dataIndex: 'partitionId', },
                        { width: 150, title: 'Lag', dataIndex: 'partitionLag', },
                    ]}
                />
            </div>
        });

        return <>{memberEntries}</>;
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
