import { FC } from "react";
import React from "react";
import { GroupDescription, GroupMemberDescription, GroupMemberAssignment } from "../../models/ServiceModels";
import { Table, Tooltip, Icon, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Tag, Badge } from "antd";
import { observer } from "mobx-react";

import { api } from "../../state/backendApi";
import { uiState as ui } from "../../state/ui";
import { PageComponent, PageInitHelper } from "./Page";
import { makePaginationConfig } from "../common";
import { motion } from "framer-motion";
import { MotionDiv } from "../../utils/animationProps";

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
                    <Statistic title='State' valueRender={n => <RenderGroupState group={group} />} />
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
    ['dead', <Badge status='processing' color='red' />],
    ['stable', <Badge status='processing' color='green' />],
]);
const RenderGroupState = (p: { group: GroupDescription }) => {
    const state = p.group.state.toLowerCase();
    let icon = stateIcons.has(state) ? stateIcons.get(state)! : null;
    // todo...
    return <>
        <span>{p.group.state}</span>
    </>
}


// Group Members
const GroupMembers = observer((p: { group: GroupDescription }) => {

    const pageConfig = makePaginationConfig();
    pageConfig.total = p.group.members.length;

    return <Table
        style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }}
        bordered={true} size={'middle'}
        pagination={pageConfig}
        dataSource={p.group.members}
        rowKey={r => r.id}
        rowClassName={(r) => 'pureDisplayRow'}
        columns={[
            { title: 'ID', dataIndex: 'id' },
            { title: 'ClientID', dataIndex: 'clientId' },
            { title: 'Client Host', dataIndex: 'clientHost' },
            { title: 'AssignedTo', dataIndex: 'assignments', render: (t, r, i) => renderAssignments(t, r, i) },
        ]} />
})

const margin1Px = { margin: '1px' };
const margin2PxLine = { margin: '2px 0' };

function renderAssignments(value: GroupMemberAssignment[], record: GroupMemberDescription, index: number): React.ReactNode {
    const topicAssignments = value.groupBy(x => x.topicName);

    const jsx: JSX.Element[] = [];

    for (let [topicName, assignments] of topicAssignments) {
        const allAssignments = assignments.flatMap(x => x.partitionIds).distinct();

        // Can we summarize the assignment? If there is only one consumer
        if (api.Topics) {
            var topic = api.Topics.find(t => t.topicName == topicName);
            if (topic) {
                if (topic.partitionCount == allAssignments.length) {
                    // Assigned to all partitions
                    jsx.push(<div style={margin2PxLine} key={topicName}><Tag color='blue'>{topicName}: <Tag color="geekblue">All partitions</Tag></Tag></div>);
                    continue;
                }
            }
        }

        // No summary, exhaustive listing
        jsx.push(<div style={margin2PxLine} key={topicName}><Tag color='blue'>{topicName}: {allAssignments.map(a => <Tag style={margin1Px} color="geekblue">{a}</Tag>)}</Tag></div>);
    }

    return jsx;
}


export default GroupDetails;
