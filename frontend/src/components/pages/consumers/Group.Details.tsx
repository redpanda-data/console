import React, { Component } from "react";
import { Table, Row, Statistic, Skeleton, Tag, Badge, Typography, Tree, Button, List, Collapse, Col, Checkbox, Card as AntCard, Input, Space, Tooltip, Popover, Empty, Modal, Select } from "antd";
import { observer } from "mobx-react";

import { api } from "../../../state/backendApi";
import { PageComponent, PageInitHelper } from "../Page";
import { makePaginationConfig, sortField } from "../../misc/common";
import { MotionDiv } from "../../../utils/animationProps";
import { GroupDescription, GroupMemberDescription } from "../../../state/restInterfaces";
import { observable } from "mobx";
import { appGlobal } from "../../../state/appGlobal";
import Card from "../../misc/Card";
import { WarningTwoTone, HourglassTwoTone, FireTwoTone, CheckCircleTwoTone, QuestionCircleOutlined } from '@ant-design/icons';
import { TablePaginationConfig } from "antd/lib/table";
import { OptionGroup, QuickTable, DefaultSkeleton, findPopupContainer, RadioOptionGroup } from "../../../utils/tsxUtils";
import { uiSettings } from "../../../state/ui";
import { SkipIcon } from "@primer/octicons-v2-react";
import { HideStatisticsBarButton } from "../../misc/HideStatisticsBarButton";
import { PencilIcon, TrashIcon, XCircleIcon } from '@heroicons/react/solid';
import { TrashIcon as TrashIconOutline, PencilIcon as PencilIconOutline } from '@heroicons/react/outline';
import { EditOffsetsModal } from "./Modals";


@observer
class GroupDetails extends PageComponent<{ groupId: string }> {
    @observable viewMode: 'topic' | 'member' = 'topic';
    @observable onlyShowPartitionsWithLag: boolean = false;

    @observable edittingMembersByTopic: GroupMembersByTopic | null = null;

    initPage(p: PageInitHelper): void {
        const group = this.props.groupId;

        p.title = this.props.groupId;
        p.addBreadcrumb('Consumer Groups', '/groups');
        if (group) p.addBreadcrumb(group, '/' + group);

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshConsumerGroups(force);
    };

    render() {
        // Get info about the group
        if (api.consumerGroups.size == 0) return DefaultSkeleton;
        const group = api.consumerGroups.get(this.props.groupId);
        if (!group) return DefaultSkeleton;

        // Get info about each topic
        const requiredTopics = group.members.flatMap(m => m.assignments.map(a => a.topicName)).distinct();
        const totalPartitions = group.members.flatMap(m => m.assignments).sum(a => a.partitionIds.length);

        return (
            <MotionDiv style={{ margin: '0 1rem' }} className="groupDetails">
                {/* Statistics Card */}
                {uiSettings.consumerGroupDetails.showStatisticsBar && <Card className='statisticsBar'>
                    <Row >
                        <HideStatisticsBarButton onClick={() => uiSettings.consumerGroupDetails.showStatisticsBar = false} />
                        <Statistic title='State' valueRender={() => <GroupState group={group} />} />
                        <ProtocolType group={group} />
                        <Statistic title='Members' value={group.members.length} />
                        <Statistic title='Assigned Topics' value={requiredTopics.length} />
                        <Statistic title='Assigned Partitions' value={totalPartitions} />
                        <Statistic title='Protocol Type' value={group.protocolType} />
                        <Statistic title='Protocol' value={group.protocol} />
                        <Statistic title='Coordinator ID' value={group.coordinatorId} />
                        <Statistic title='Total Lag' value={group.lagSum} />
                    </Row>
                </Card>
                }

                {/* Main Card */}
                <Card>
                    {/* View Buttons */}
                    <Space size='large' style={{ marginLeft: '.5em', marginBottom: '2em' }}>

                        <OptionGroup label='View'
                            options={{
                                "Members": 'member',
                                "Topics": 'topic'
                            }}
                            value={this.viewMode}
                            onChange={s => this.viewMode = s}
                        />

                        <OptionGroup label='Filter'
                            options={{
                                "Show All": false,
                                "With Lag": true
                            }}
                            value={this.onlyShowPartitionsWithLag}
                            onChange={s => this.onlyShowPartitionsWithLag = s}
                        />
                    </Space>

                    {this.viewMode == 'member'
                        ? <GroupByMembers group={group} onlyShowPartitionsWithLag={this.onlyShowPartitionsWithLag} />
                        : <GroupByTopics group={group} onlyShowPartitionsWithLag={this.onlyShowPartitionsWithLag}
                            onEditTopic={g => this.edittingMembersByTopic = g}
                        />
                    }
                </Card>

                {/* Modals */}
                <>


                    <EditOffsetsModal
                        group={group}
                        membersByTopic={this.edittingMembersByTopic}
                        onClose={() => this.edittingMembersByTopic = null}
                    />

                    {/*
                        font-family: "Inter";
                        font-size: 12px;
                        font-weight: 500;
                    */}

                </>
            </MotionDiv>
        );
    }
}

export type GroupMembersByTopic = {
    topicName: string;
    partitions: {
        topicName: string;
        partitionId: number;
        lag: number;
        assignedMember: GroupMemberDescription | undefined;
        id: string | undefined;
        clientId: string | undefined;
        host: string | undefined;
    }[];
};

@observer
class GroupByTopics extends Component<{
    group: GroupDescription,
    onlyShowPartitionsWithLag: boolean,
    onEditTopic: (g: GroupMembersByTopic) => void,
}>{

    pageConfig: TablePaginationConfig;

    constructor(props: any) {
        super(props);
        this.pageConfig = makePaginationConfig(30);
        this.pageConfig.hideOnSinglePage = true;
        this.pageConfig.showSizeChanger = false;
    }

    render() {
        const topicLags = this.props.group.topicOffsets;
        const p = this.props;
        const allAssignments = p.group.members
            .flatMap(m => m.assignments
                .map(as => ({ member: m, topicName: as.topicName, partitions: as.partitionIds })));

        const lagsFlat = topicLags.flatMap(topicLag =>
            topicLag.partitionOffsets.map(partLag => {

                const assignedMember = allAssignments.find(e =>
                    e.topicName == topicLag.topic
                    && e.partitions.includes(partLag.partitionId));

                return {
                    topicName: topicLag.topic,
                    partitionId: partLag.partitionId,
                    offset: partLag.groupOffset,
                    lag: partLag.lag,

                    assignedMember: assignedMember?.member,
                    id: assignedMember?.member.id,
                    clientId: assignedMember?.member.clientId,
                    host: assignedMember?.member.clientHost
                }
            })
        );

        const lagGroupsByTopic = lagsFlat.groupInto(e => e.topicName).sort((a, b) => a.key.localeCompare(b.key))
            .map(x => ({ topicName: x.key, partitions: x.items }));

        const topicEntries = lagGroupsByTopic.map(g => {
            const totalLagAll = g.partitions.sum(c => c.lag ?? 0);
            const partitionsAssigned = g.partitions.filter(c => c.assignedMember).length;

            if (p.onlyShowPartitionsWithLag)
                g.partitions.removeAll(e => e.lag === 0);

            if (g.partitions.length == 0)
                return null;

            return <Collapse.Panel key={g.topicName}
                header={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {/* Title */}
                        <span style={{ fontWeight: 600, fontSize: '1.1em' }}>{g.topicName}</span>

                        {/* EditButtons */}
                        <div style={{ width: '2px' }} />
                        <div className="iconButton" onClick={() => p.onEditTopic(g)} ><PencilIcon /></div>
                        <div className="iconButton"><TrashIcon /></div>

                        {/* InfoTags */}
                        <Tooltip placement='top' title='Summed lag of all partitions of the topic' mouseEnterDelay={0}
                            getPopupContainer={findPopupContainer} >
                            <Tag style={{ margin: '0', marginLeft: '8px' }} color='blue'>lag: {totalLagAll}</Tag>
                        </Tooltip>
                        <Tooltip placement='top' title='Number of assigned partitions' mouseEnterDelay={0}
                            getPopupContainer={findPopupContainer}>
                            <Tag color='blue'>assigned partitions: {partitionsAssigned}</Tag>
                        </Tooltip>
                    </div>
                }>

                <Table
                    size='middle'
                    showSorterTooltip={false}
                    pagination={this.pageConfig}
                    onChange={(pagination) => {
                        if (pagination.pageSize) uiSettings.consumerGroupDetails.pageSize = pagination.pageSize;
                        this.pageConfig.current = pagination.current;
                        this.pageConfig.pageSize = pagination.pageSize;
                    }}
                    dataSource={g.partitions}
                    rowKey={r => r.partitionId}
                    rowClassName={(r) => (r.assignedMember) ? '' : 'consumerGroupNoMemberAssigned'}
                    columns={[
                        { width: 100, title: 'Partition', dataIndex: 'partitionId', sorter: sortField('partitionId'), defaultSortOrder: 'ascend' },
                        {
                            width: 'auto', title: 'Assigned Member', dataIndex: 'id', sorter: sortField('id'),
                            render: (t, r) => (r.assignedMember ?
                                renderMergedID(r.id, r.clientId) :
                                <span style={{ opacity: 0.66, margin: '0 3px' }}><SkipIcon /> No assigned member</span>)
                        },
                        {
                            width: 'auto', title: 'Host', dataIndex: 'host', sorter: sortField('host'),
                            render: (t, r) => (r.host ??
                                <span style={{ opacity: 0.66, margin: '0 3px' }}><SkipIcon /></span>)
                        },
                        { width: 120, title: 'Offset', dataIndex: 'offset', sorter: sortField('offset') },
                        { width: 80, title: 'Lag', dataIndex: 'lag', sorter: sortField('lag') },
                        {
                            width: 1, title: ' ', key: 'action', className: 'msgTableActionColumn',
                            // filters: [],
                            // filterDropdownVisible: false,
                            // onFilterDropdownVisibleChange: (_) => this.showColumnSettings = true,
                            // filterIcon: (_) => {
                            //     return <Tooltip title='Column Settings' mouseEnterDelay={0.1}>
                            //         <SettingFilled style={IsColumnSettingsEnabled ? { color: '#1890ff' } : { color: '#a092a0' }} />
                            //     </Tooltip>
                            // },
                            render: (text, record) => (
                                <Button className='iconButton'
                                    style={{ verticalAlign: 'middle' }}
                                    type='link' icon={<PencilIcon />}
                                    size='middle'
                                />
                            ),
                        },
                    ]}
                />

            </Collapse.Panel>
        });

        const defaultExpand = lagGroupsByTopic.length == 1
            ? lagGroupsByTopic[0].topicName // only one -> expand
            : undefined; // more than one -> collapse

        const nullEntries = topicEntries.filter(e => e == null).length;
        if (topicEntries.length == 0 || topicEntries.length == nullEntries)
            return <Empty style={{
                background: 'radial-gradient(hsl(0deg 0% 100%) 40%, hsl(0deg 0% 97%) 90%)',
                borderRadius: '5px',
                padding: '1.5em'
            }}>
                {p.onlyShowPartitionsWithLag
                    ? <span>All {topicEntries.length} topics have been filtered (no lag on any partition).</span>
                    : null}
            </Empty>

        return <Collapse bordered={false} defaultActiveKey={defaultExpand}>{topicEntries}</Collapse>;
    }
}

@observer
class GroupByMembers extends Component<{ group: GroupDescription, onlyShowPartitionsWithLag: boolean }>{

    pageConfig: TablePaginationConfig;

    constructor(props: any) {
        super(props);
        this.pageConfig = makePaginationConfig(30);
        this.pageConfig.hideOnSinglePage = true;
        this.pageConfig.showSizeChanger = false;
    }

    render() {
        const topicLags = this.props.group.topicOffsets;
        const p = this.props;

        const memberEntries = p.group.members
            // sorting actually not necessary
            // .sort((a, b) => a.id.localeCompare(b.id))
            .map((m, i) => {
                const assignments = m.assignments;

                const assignmentsFlat = assignments
                    .map(a => a.partitionIds.map(id => {
                        const topicLag = topicLags.find(t => t.topic == a.topicName);
                        const partLag = topicLag?.partitionOffsets.find(p => p.partitionId == id)?.lag;
                        return {
                            topicName: a.topicName,
                            partitionId: id,
                            partitionLag: partLag ?? 0,
                        }
                    })).flat();

                const totalLag = assignmentsFlat.sum(t => t.partitionLag ?? 0);
                const totalPartitions = assignmentsFlat.length;

                if (p.onlyShowPartitionsWithLag)
                    assignmentsFlat.removeAll(e => e.partitionLag === 0);

                if (assignmentsFlat.length == 0)
                    return null;

                return <Collapse.Panel key={m.id} forceRender={false}
                    header={
                        <div>
                            <span style={{ fontWeight: 600, fontSize: '1.1em' }}>{renderMergedID(m.id, m.clientId)}</span>
                            <Tooltip placement='top' title='Host of the member' mouseEnterDelay={0} getPopupContainer={findPopupContainer}>
                                <Tag style={{ marginLeft: '1em' }} color='blue'>host: {m.clientHost}</Tag>
                            </Tooltip>
                            <Tooltip placement='top' title='Number of assigned partitions' mouseEnterDelay={0} getPopupContainer={findPopupContainer}>
                                <Tag color='blue'>partitions: {totalPartitions}</Tag>
                            </Tooltip>
                            <Tooltip placement='top' title='Summed lag over all assigned partitions of all topics' mouseEnterDelay={0} getPopupContainer={findPopupContainer}>
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

        const nullEntries = memberEntries.filter(e => e == null).length;
        if (memberEntries.length == 0 || memberEntries.length == nullEntries)
            return <Empty style={{
                background: 'radial-gradient(hsl(0deg 0% 100%) 40%, hsl(0deg 0% 97%) 90%)',
                borderRadius: '5px',
                padding: '1.5em'
            }}>
                {p.onlyShowPartitionsWithLag
                    ? <span>All {memberEntries.length} members have been filtered (no lag on any partition).</span>
                    : null}
            </Empty>

        return <Collapse bordered={false} defaultActiveKey={defaultExpand}>{memberEntries}</Collapse>;
    }
}


const renderMergedID = (id?: string, clientId?: string) => {
    if (clientId && id?.startsWith(clientId)) { // should always be true...
        const suffix = id.substring(clientId.length);

        return <span className='consumerGroupCompleteID'>
            <span className='consumerGroupName'>{clientId}</span>
            <span className='consumerGroupSuffix'>{suffix}</span>
        </span>
    }
    // A client might be connected but it hasn't any assignments yet because it just joined the group
    else if (clientId) {
        return <span className='consumerGroupCompleteID'>{clientId ?? id ?? ''}</span>
    }

    return null
};



const stateIcons = new Map<string, JSX.Element>([
    ['stable', <CheckCircleTwoTone twoToneColor='#52c41a' />],
    ['completingrebalance', <HourglassTwoTone twoToneColor='#52c41a' />],
    ['preparingrebalance', <HourglassTwoTone twoToneColor='orange' />],
    ['empty', <WarningTwoTone twoToneColor='orange' />],
    ['dead', <FireTwoTone twoToneColor='orangered' />],
    ['unknown', <QuestionCircleOutlined />],
]);
const makeStateEntry = (iconName: string, displayName: string, description: string): [any, any] => [
    <span>{stateIcons.get(iconName)} <span style={{ fontSize: '85%', fontWeight: 600 }}>{displayName}</span></span>,
    <div style={{ maxWidth: '350px' }}>{description}</div>
]

const consumerGroupStateTable = QuickTable([
    makeStateEntry('stable', "Stable", "Consumer group has members which have been assigned partitions"),
    makeStateEntry('completingrebalance', "Completing Rebalance", "Kafka is assigning partitions to group members"),
    makeStateEntry('preparingrebalance', "Preparing Rebalance", "A reassignment of partitions is required, members have been asked to stop consuming"),
    makeStateEntry('empty', "Empty", "Consumer group exists, but does not have any members"),
    makeStateEntry('dead', "Dead", "Consumer group does not have any members and it's metadata has been removed"),
    makeStateEntry('unknown', "Unknown", "Group state is not known"),
], {
    gapHeight: '.5em',
    gapWidth: '.5em',
    keyStyle: { verticalAlign: 'top' },
});

export const GroupState = (p: { group: GroupDescription }) => {
    const state = p.group.state.toLowerCase();
    const icon = stateIcons.get(state);

    return <Popover content={consumerGroupStateTable} placement='right'>
        <span>
            {icon}
            <span> {p.group.state}</span>
        </span>
    </Popover>
}
const ProtocolType = (p: { group: GroupDescription }) => {
    const protocol = p.group.protocolType;
    if (protocol == 'consumer') return null;

    return <Statistic title='Protocol' value={protocol} />
}

export default GroupDetails;
