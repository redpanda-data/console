import React from "react";
import { Table, Row, Statistic, Skeleton, Tag, Badge, Typography, Icon, Tree, Button, List, Collapse } from "antd";
import { observer } from "mobx-react";

import { api } from "../../state/backendApi";
import { PageComponent, PageInitHelper } from "./Page";
import { makePaginationConfig } from "../misc/common";
import { MotionDiv } from "../../utils/animationProps";
import { GroupDescription, GroupMemberDescription, GroupMemberAssignment, TopicLag } from "../../state/restInterfaces";
import { groupConsecutive } from "../../utils/utils";
const { Text } = Typography;
const { TreeNode } = Tree;

@observer
class GroupDetails extends PageComponent<{ groupId: string }> {

    initPage(p: PageInitHelper): void {
        const group = this.props.groupId;

        p.title = this.props.groupId;
        p.addBreadcrumb('Consumer Groups', '/groups');
        if (group) p.addBreadcrumb(group, '/' + group);

        api.refreshConsumerGroups();
        api.refreshTopics(); // we also need the topics, so we know how many partitions each topic has
    }

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
            <MotionDiv>
                {/* States can be: Dead, Initializing, Rebalancing, Stable */}
                <Row type="flex" style={{ marginBottom: '1em' }}>
                    <Statistic title='State' valueRender={() => <GroupState group={group} />} style={{ marginRight: '2em' }} />
                    <Statistic title='Consumers' value={group.members.length} style={{ marginRight: '2em' }} />
                    <ProtocolType group={group} />
                </Row>

                <GroupMembers group={group} />
            </MotionDiv>
        );
    }

    skeleton = <MotionDiv identityKey='loader'>
        <Skeleton loading={true} active={true} paragraph={{ rows: 8 }} />
    </MotionDiv>
}

const stateIcons = new Map<string, JSX.Element>([
    ['dead', <Icon type="fire" theme='twoTone' twoToneColor='orangered' />],
    ['empty', <Icon type="warning" theme='twoTone' twoToneColor='orange' />],
    ['stable', <Icon type="check-circle" theme='twoTone' twoToneColor='#52c41a' />],
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
        style={{ margin: '0', padding: '0', whiteSpace: 'normal' }}
        bordered={true} size={'middle'}

        //expandRowByClick={false}
        expandIconAsCell={false}
        expandIconColumnIndex={0}
        expandedRowRender={(record: GroupMemberDescription) => <ExpandedGroupMember groupId={p.group.groupId} topicLags={topicLags} member={record} />}

        pagination={pageConfig}
        dataSource={p.group.members}
        rowKey={r => r.id}
        rowClassName={() => 'pureDisplayRow'}
        columns={[
            { title: <span>ID</span>, dataIndex: 'id', className: 'whiteSpaceDefault' },
            { width: '150px', title: 'ClientID', dataIndex: 'clientId' },
            { width: '150px', title: 'Client Host', dataIndex: 'clientHost' },
            { title: 'AssignedTo', dataIndex: 'assignments', render: (t, r, i) => renderAssignments(t), className: 'whiteSpaceDefault' },
        ]} />
})

const ExpandedGroupMember = observer((p: { groupId: string, topicLags: TopicLag[], member: GroupMemberDescription }) => {

    const renderPartitionLag = (pp: { topicLag: TopicLag, partitionId: number }) => {
        const lag = pp.topicLag.partitionLags.find(lag => lag.partitionId == pp.partitionId);
        return <div><Tag>Partition{pp.partitionId}: {lag? lag.lag : '??'}</Tag></div>
    };

    const assignments = p.member.assignments.map((assignment: GroupMemberAssignment, index) => {
        const topicLag = p.topicLags.find(tl => tl.topic == assignment.topicName);
        if (!topicLag) return <div>Backend provided no lag information for topic "<code>{assignment.topicName}</code>"</div>;

        return <Collapse.Panel key={index} header={assignment.topicName}>
            <div>Lag in each partition:</div>
            <div>This is just a placeholder UI for lag per partition/per topic. It will be redone later.</div>
            {assignment.partitionIds.map(id => renderPartitionLag({ topicLag: topicLag, partitionId: id }))}
        </Collapse.Panel>
    });

    return <Collapse bordered={false} defaultActiveKey={[0]}>
        {assignments}
    </Collapse>
});

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


export default GroupDetails;
