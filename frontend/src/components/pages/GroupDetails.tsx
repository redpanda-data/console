import React, { Component } from "react";
import { Table, Row, Statistic, Skeleton, Tag, Badge, Typography, Tree, Button, List, Collapse, Col, Checkbox, Card as AntCard } from "antd";
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

const { Text } = Typography;
const { TreeNode } = Tree;

@observer
class GroupDetails extends PageComponent<{ groupId: string }> {

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
        for (let topicName of requiredTopics) {
            const topic = api.Topics.find(t => t.topicName == topicName);
            if (!topic) {
                //api.refreshTopics();
                console.log('waiting for topic data...');
                return this.skeleton;
            }
        }


        return (
            <MotionDiv style={{ margin: '0 1rem' }}>
                {/* States can be: Dead, Initializing, Rebalancing, Stable */}
                <Card>
                    {/* <Row type="flex"> */}
                    <Row >
                        <Statistic title='State' valueRender={() => <GroupState group={group} />} />
                        <Statistic title='Consumers' value={group.members.length} />
                        <ProtocolType group={group} />
                    </Row>
                </Card>

                <Card>
                    <GroupMembers group={group} />
                </Card>
            </MotionDiv>
        );
    }

    skeleton = <MotionDiv identityKey='loader' style={{ margin: '2rem' }}>
        <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
    </MotionDiv>
}

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


// Group Members
const GroupMembers = observer((p: { group: GroupDescription }) => {

    const pageConfig = makePaginationConfig();
    const topicLags = p.group.lag.topicLags;

    return <Table
        style={{ margin: '0', padding: '0', whiteSpace: 'normal' }} size={'middle'}
        //expandIconAsCell={false} // broken since antd4
        expandable={{
            // expandIcon: () => null,
            expandIconColumnIndex: 0,
            expandRowByClick: true,
            expandedRowRender: (record: GroupMemberDescription) => <ExpandedGroupMember groupId={p.group.groupId} topicLags={topicLags} member={record} />,
        }}
        pagination={pageConfig}
        dataSource={p.group.members}
        rowKey={r => r.id}
        rowClassName={() => 'pureDisplayRow'}
        columns={[
            { title: <span>Consumer ID</span>, dataIndex: 'id', className: 'whiteSpaceDefault', render: renderMergedID, sorter: sortField('id'), sortOrder: 'ascend' },
            //{ width: '150px', title: 'ClientID', dataIndex: 'clientId' },
            { width: '150px', title: 'Client Host', dataIndex: 'clientHost' },
            { title: 'Assignments', dataIndex: 'assignments', render: (t, r, i) => renderAssignments(t), className: 'whiteSpaceDefault' },
        ]} />
})

const renderMergedID = (text: string, record: GroupMemberDescription) => {
    if (record.id.startsWith(record.clientId)) { // should always be true...
        const suffix = record.id.substring(record.clientId.length);
        return <span className='consumerGroupCompleteID'>
            <span className='consumerGroupName'>{record.clientId}</span>
            <span className='consumerGroupSuffix'>{suffix}</span>
        </span>
    }
};

const margin1Px = { margin: '1px' };
const margin2PxLine = { margin: '2px 0' };

function renderAssignments(value: GroupMemberAssignment[]): React.ReactNode {
    const topicAssignments = value.groupBy(x => x.topicName);

    const jsx: JSX.Element[] = [];

    for (let [topicName, assignments] of topicAssignments) {
        const assignedIds = assignments.flatMap(x => x.partitionIds).distinct();

        // Try to summarize the assignment...
        if (api.Topics) {
            var topic = api.Topics.find(t => t.topicName == topicName);
            if (topic) {
                // All partitions?
                if (topic.partitionCount == assignedIds.length) {
                    jsx.push(<span style={margin2PxLine} key={topicName}><Tag color='blue'>{topicName}: <Tag color="geekblue">All partitions</Tag><b>({assignedIds.length})</b></Tag></span>);
                    continue;
                }
            }
        }

        // List partitions explicitly, but maybe we can merge some groups
        assignedIds.sort((a, b) => a - b);
        const groups = groupConsecutive(assignedIds);
        const ids: JSX.Element[] = [];
        for (let group of groups) {
            const text = group.length == 1
                ? group[0].toString() // single ID
                : group[0] + " .. " + group[group.length - 1]; // range of IDs
            ids.push(<Tag style={margin1Px} color="geekblue">{text}</Tag>);
        }

        jsx.push(<span style={margin2PxLine} key={topicName}><Tag color='blue'>{topicName}: {ids}<b> ({assignedIds.length})</b></Tag></span>);
    }

    return jsx;
}


const ExpandedGroupMember = observer((p: { groupId: string, topicLags: TopicLag[], member: GroupMemberDescription }) => {

    // For debugging:
    ///////////
    //const sourceAssignments = [...p.member.assignments];
    // sourceAssignments.push({ ...sourceAssignments[0]});
    // sourceAssignments.push({ ...sourceAssignments[0]});
    // sourceAssignments.push({ ...sourceAssignments[0]});
    // sourceAssignments.push({ ...sourceAssignments[0]});
    // sourceAssignments.push({ ...sourceAssignments[0]});
    const sourceAssignments = p.member.assignments;
    ///////////

    const assignments = sourceAssignments.map((assignment: GroupMemberAssignment, index) => {
        const topicLag = p.topicLags.find(tl => tl.topic == assignment.topicName);
        if (!topicLag) {
            console.log('Backend provided no lag information for topic: ' + assignment.topicName);
            return null;
        }
        return <TopicLags key={assignment.topicName} name={assignment.topicName} partitions={assignment.partitionIds} topicLag={topicLag} />
    });

    return <Row gutter={[16, 16]}>
        {assignments}
    </Row>
});

@observer
class TopicLags extends Component<{ name: string, partitions: number[], topicLag: TopicLag }> {

    @observable isExpanded = false;

    render() {
        const p = this.props;

        const renderPartitionLag = (p: { id: number, lag: number }) => {
            // <div className='lagIndicatorBg'><div className='lagIndicatorFill' style={{ width: '%' }}></div></div>
            return <div className='groupLagDisplayLine'>Partition{p.id}: {p.lag} messages</div>
        };

        const renderLagTable = (lags: { id: number, lag: number }[]): JSX.Element => {
            return <table className='groupLagDisplayLine'>
                <thead>
                    <tr>
                        <th>Partition</th>
                        <th>Lag</th>
                    </tr>
                </thead>
                <tbody>
                    {lags.map(l => <tr>
                        <td>{l.id}</td>
                        <td>{l.lag}</td>
                    </tr>)}
                </tbody>
            </table>
        }

        const expandBtn = <a onClick={() => this.isExpanded = !this.isExpanded}>{this.isExpanded ? 'Less' : 'More'}</a>

        let partitionLags = p.partitions
            .map(id => {
                const pLag = p.topicLag.partitionLags.find(lag => lag.partitionId == id);
                return { id: id, lag: pLag ? pLag.lag : 0 };
            })
            .sort((a, b) => b.lag - a.lag);

        const isAllZeroLag = !this.isExpanded && (partitionLags.length == 0 || partitionLags.all(l => l.lag == 0));

        if (!this.isExpanded) // In small view: show only non-zero, and only top5
            partitionLags = partitionLags.filter(l => l.lag > 0).slice(0, 5);

        return <Col xs={24} sm={24} md={24} lg={12} xl={8} xxl={6}>
            <AntCard size="small" title={p.name} extra={expandBtn} style={{ marginBottom: '1em' }}>
                {
                    isAllZeroLag
                        ? <span style={{ fontSize: '.75rem' }}>No lag on any partition</span>
                        : renderLagTable(partitionLags)
                }
            </AntCard>
        </Col>
    }
}


export default GroupDetails;
