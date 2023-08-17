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

import React, { Component } from 'react';
import { Table, Collapse, Empty } from 'antd';
import { observer } from 'mobx-react';

import { api } from '../../../state/backendApi';
import { PageComponent, PageInitHelper } from '../Page';
import { makePaginationConfig, sortField } from '../../misc/common';
import { GroupDescription } from '../../../state/restInterfaces';
import { action, computed, makeObservable, observable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { WarningTwoTone, HourglassTwoTone, FireTwoTone, CheckCircleTwoTone, QuestionCircleOutlined } from '@ant-design/icons';
import { TablePaginationConfig } from 'antd/lib/table';
import { OptionGroup, QuickTable, DefaultSkeleton, numberToThousandsString, Button, IconButton } from '../../../utils/tsxUtils';
import { uiSettings } from '../../../state/ui';
import { HideStatisticsBarButton } from '../../misc/HideStatisticsBarButton';
import { PencilIcon, TrashIcon } from '@heroicons/react/solid';
import { EditOffsetsModal, GroupOffset, DeleteOffsetsModal, GroupDeletingMode } from './Modals';
import { ShortNum } from '../../misc/ShortNum';
import AclList from '../topics/Tab.Acl/AclList';
import { SkipIcon } from '@primer/octicons-react';
import { Flex, Section, Tabs, Tag, Tooltip, Popover } from '@redpanda-data/ui';
import PageContent from '../../misc/PageContent';
import { Features } from '../../../state/supportedFeatures';
import { Statistic } from '../../misc/Statistic';
@observer
class GroupDetails extends PageComponent<{ groupId: string }> {
    @observable viewMode: 'topic' | 'member' = 'topic';
    @observable onlyShowPartitionsWithLag: boolean = false;

    @observable edittingOffsets: GroupOffset[] | null = null;

    @observable deletingMode: GroupDeletingMode = 'group';
    @observable deletingOffsets: GroupOffset[] | null = null;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        const group = decodeURIComponent(this.props.groupId);

        p.title = this.props.groupId;
        p.addBreadcrumb('Consumer Groups', '/groups');
        if (group) p.addBreadcrumb(group, '/' + group);

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        const group = decodeURIComponent(this.props.groupId);
        api.refreshConsumerGroup(group, force);
        api.refreshConsumerGroupAcls(group, force);
    }

    renderPartitions(group: GroupDescription) {
        return (
            <>
                <div style={{ display: 'flex', marginLeft: '.5em', marginBottom: '2em', gap: '1em', alignItems: 'flex-end' }}>
                    <OptionGroup
                        label="View"
                        options={{
                            Members: 'member',
                            Topics: 'topic'
                        }}
                        value={this.viewMode}
                        onChange={s => (this.viewMode = s)}
                    />

                    <OptionGroup
                        label="Filter"
                        options={{
                            'Show All': false,
                            'With Lag': true
                        }}
                        value={this.onlyShowPartitionsWithLag}
                        onChange={s => (this.onlyShowPartitionsWithLag = s)}
                    />

                    <span style={{ marginLeft: 'auto' }} />

                    <Button variant="outline" onClick={() => this.editGroup()} disabledReason={cannotEditGroupReason(group)}>
                        Edit Group
                    </Button>
                    <Button variant="outline" colorScheme="red" onClick={() => this.deleteGroup()} disabledReason={cannotDeleteGroupReason(group)}>
                        Delete Group
                    </Button>
                </div>

                {/* Main Content */}
                {this.viewMode == 'member' ? (
                    <GroupByMembers group={group} onlyShowPartitionsWithLag={this.onlyShowPartitionsWithLag} />
                ) : (
                    <GroupByTopics
                        group={group}
                        onlyShowPartitionsWithLag={this.onlyShowPartitionsWithLag}
                        onEditOffsets={g => (this.edittingOffsets = g)}
                        onDeleteOffsets={(offsets, mode) => {
                            this.deletingMode = mode;
                            this.deletingOffsets = offsets;
                        }}
                    />
                )}
            </>
        );
    }

    render() {
        // Get info about the group
        if (api.consumerGroups.size == 0) return DefaultSkeleton;
        const group = this.group;
        if (!group) return DefaultSkeleton;

        // Get info about each topic
        const totalPartitions = group.members.flatMap(m => m.assignments).sum(a => a.partitionIds.length);

        return (
            <PageContent className="groupDetails">
                {/* Statistics Card */}
                {uiSettings.consumerGroupDetails.showStatisticsBar && (
                    <Section py={4}>
                        <div className="statisticsBar">
                            <Flex gap="2rem">
                                <HideStatisticsBarButton
                                    onClick={() =>
                                    (uiSettings.consumerGroupDetails.showStatisticsBar =
                                        false)
                                    }
                                />
                                <Statistic
                                    title="State"
                                    value={<GroupState group={group} />}
                                />
                                <Statistic
                                    title="Assigned Partitions"
                                    value={totalPartitions}
                                />
                                <ProtocolType group={group} />
                                <Statistic title="Protocol Type" value={group.protocolType} />
                                <Statistic title="Coordinator ID" value={group.coordinatorId} />
                                <Statistic title="Total Lag" value={group.lagSum} />
                            </Flex>
                        </div>
                    </Section>
                )}

                {/* Main Card */}
                <Section>
                    {/* View Buttons */}
                    <Tabs
                        isFitted
                        items={[
                            {
                                key: 'partitions',
                                name: 'Partitions',
                                component: this.renderPartitions(group)
                            },
                            {
                                key: 'acl',
                                name: 'ACL',
                                component: <AclList acl={api.consumerGroupAcls.get(group.groupId)} />
                            }
                        ]}
                    />
                </Section>

                {/* Modals */}
                <>
                    <EditOffsetsModal group={group} offsets={this.edittingOffsets} onClose={() => (this.edittingOffsets = null)} />

                    <DeleteOffsetsModal group={group} mode={this.deletingMode} offsets={this.deletingOffsets} onClose={() => (this.deletingOffsets = null)} />
                </>
            </PageContent>
        );
    }

    @computed get group() {
        const groupId = decodeURIComponent(this.props.groupId);
        return api.consumerGroups.get(groupId);
    }

    @action editGroup() {
        const groupOffsets = this.group?.topicOffsets.flatMap(x => {
            return x.partitionOffsets.map(p => {
                return { topicName: x.topic, partitionId: p.partitionId, offset: p.groupOffset } as GroupOffset;
            });
        });

        if (!groupOffsets) return;

        this.edittingOffsets = groupOffsets;
    }

    @action deleteGroup() {
        const groupOffsets = this.group?.topicOffsets.flatMap(x => {
            return x.partitionOffsets.map(p => {
                return { topicName: x.topic, partitionId: p.partitionId, offset: p.groupOffset } as GroupOffset;
            });
        });

        if (!groupOffsets) return;

        this.deletingOffsets = groupOffsets;
        this.deletingMode = 'group';
    }
}

@observer
class GroupByTopics extends Component<{
    group: GroupDescription;
    onlyShowPartitionsWithLag: boolean;
    onEditOffsets: (offsets: GroupOffset[]) => void;
    onDeleteOffsets: (offsets: GroupOffset[], mode: GroupDeletingMode) => void;
}> {
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
        const allAssignments = p.group.members.flatMap(m => m.assignments.map(as => ({ member: m, topicName: as.topicName, partitions: as.partitionIds })));

        const lagsFlat = topicLags.flatMap(topicLag =>
            topicLag.partitionOffsets.map(partLag => {
                const assignedMember = allAssignments.find(e => e.topicName == topicLag.topic && e.partitions.includes(partLag.partitionId));

                return {
                    topicName: topicLag.topic,
                    partitionId: partLag.partitionId,
                    groupOffset: partLag.groupOffset,
                    highWaterMark: partLag.highWaterMark,
                    lag: partLag.lag,

                    assignedMember: assignedMember?.member,
                    id: assignedMember?.member.id,
                    clientId: assignedMember?.member.clientId,
                    host: assignedMember?.member.clientHost
                };
            })
        );

        const lagGroupsByTopic = lagsFlat
            .groupInto(e => e.topicName)
            .sort((a, b) => a.key.localeCompare(b.key))
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

                        <IconButton onClick={e => { p.onEditOffsets(g.partitions); e.stopPropagation(); }} disabledReason={cannotEditGroupReason(this.props.group)}>
                            <PencilIcon />
                        </IconButton>
                        <IconButton onClick={e => { p.onDeleteOffsets(g.partitions, 'topic'); e.stopPropagation(); }} disabledReason={cannotDeleteGroupOffsetsReason(this.props.group)} >
                            <TrashIcon />
                        </IconButton>

                        {/* InfoTags */}
                        <Tooltip placement="top" label="Summed lag of all partitions of the topic" hasArrow>
                            <Tag style={{ margin: '0', marginLeft: '8px' }} color="rgb(225, 66, 38)">
                                lag: {numberToThousandsString(totalLagAll)}
                            </Tag>
                        </Tooltip>
                        <Tooltip placement="top" label="Number of assigned partitions" hasArrow>
                            <Tag color="rgb(225, 66, 38)">assigned partitions: {partitionsAssigned}</Tag>
                        </Tooltip>
                        <Button
                            variant="outline"
                            size="sm"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => appGlobal.history.push(`/topics/${encodeURIComponent(g.topicName)}`)}
                        >View Topic</Button>
                    </div>
                }>

                <Table
                    size="middle"
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
                        { width: 120, title: 'Log End Offset', dataIndex: 'highWaterMark', render: v => numberToThousandsString(v), sorter: sortField('highWaterMark') },
                        { width: 120, title: 'Group Offset', dataIndex: 'groupOffset', render: v => numberToThousandsString(v), sorter: sortField('groupOffset') },
                        { width: 80, title: 'Lag', dataIndex: 'lag', render: v => ShortNum({ value: v, tooltip: true }), sorter: sortField('lag') },
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
                            render: (text, record) => <div style={{ paddingRight: '.5em', display: 'flex', gap: '4px' }}>
                                <IconButton onClick={() => p.onEditOffsets([record])} disabledReason={cannotEditGroupReason(this.props.group)}>
                                    <PencilIcon />
                                </IconButton>
                                <IconButton onClick={() => p.onDeleteOffsets([record], 'partition')} disabledReason={cannotDeleteGroupOffsetsReason(this.props.group)} >
                                    <TrashIcon />
                                </IconButton>
                            </div>,
                        },
                    ]}
                />

            </Collapse.Panel>
        });

        const defaultExpand =
            lagGroupsByTopic.length == 1
                ? lagGroupsByTopic[0].topicName // only one -> expand
                : undefined; // more than one -> collapse

        const nullEntries = topicEntries.filter(e => e == null).length;
        if (topicEntries.length == 0 || topicEntries.length == nullEntries)
            return (
                <Empty
                    style={{
                        background: 'radial-gradient(hsl(0deg 0% 100%) 40%, hsl(0deg 0% 97%) 90%)',
                        borderRadius: '5px',
                        padding: '1.5em'
                    }}
                >
                    {p.onlyShowPartitionsWithLag ? <span>All {topicEntries.length} topics have been filtered (no lag on any partition).</span> : null}
                </Empty>
            );

        return (
            <Collapse bordered={false} defaultActiveKey={defaultExpand}>
                {topicEntries}
            </Collapse>
        );
    }
}

@observer
class GroupByMembers extends Component<{ group: GroupDescription; onlyShowPartitionsWithLag: boolean }> {
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
            .map(m => {
                const assignments = m.assignments;

                const assignmentsFlat = assignments
                    .map(a =>
                        a.partitionIds.map(id => {
                            const topicLag = topicLags.find(t => t.topic == a.topicName);
                            const partLag = topicLag?.partitionOffsets.find(p => p.partitionId == id)?.lag;
                            return {
                                topicName: a.topicName,
                                partitionId: id,
                                partitionLag: partLag ?? 0
                            };
                        })
                    )
                    .flat();

                const totalLag = assignmentsFlat.sum(t => t.partitionLag ?? 0);
                const totalPartitions = assignmentsFlat.length;

                if (p.onlyShowPartitionsWithLag)
                    assignmentsFlat.removeAll(e => e.partitionLag === 0);

                if (assignmentsFlat.length == 0)
                    return null;

                return <Collapse.Panel key={m.id} forceRender={false}
                    header={
                        <Flex alignItems="baseline" gap="2">
                            <span style={{ fontWeight: 600, fontSize: '1.1em' }}>{renderMergedID(m.id, m.clientId)}</span>
                            <Tooltip placement="top" label="Host of the member" hasArrow>
                                <Tag style={{ marginLeft: '1em' }} color="blue">
                                    host: {m.clientHost}
                                </Tag>
                            </Tooltip>
                            <Tooltip placement="top" label="Number of assigned partitions" hasArrow>
                                <Tag color="rgb(225, 66, 38)">partitions: {totalPartitions}</Tag>
                            </Tooltip>
                            <Tooltip placement="top" label="Summed lag over all assigned partitions of all topics" hasArrow>
                                <Tag color="rgb(225, 66, 38)">lag: {totalLag}</Tag>
                            </Tooltip>
                        </Flex>
                    }>

                    <Table
                        size="small"
                        pagination={this.pageConfig}
                        dataSource={assignmentsFlat}
                        rowKey={r => r.topicName + r.partitionId}
                        columns={[
                            {
                                width: 130, title: 'Topic', dataIndex: 'topicName', sorter: sortField('topicName'),
                                render: (_, record) => <div
                                    className="hoverLink"
                                    onClick={() => appGlobal.history.push(`/topics/${encodeURIComponent(record.topicName)}`)}>
                                    {record.topicName}
                                </div>
                            },
                            { title: 'Partition', dataIndex: 'partitionId', sorter: sortField('partitionId') },
                            { title: 'Lag', dataIndex: 'partitionLag', render: v => numberToThousandsString(v), sorter: sortField('partitionLag'), defaultSortOrder: 'descend' },
                        ]}
                    />
                </Collapse.Panel>
            });

        const defaultExpand =
            p.group.members.length == 1
                ? p.group.members[0].id // if only one entry, expand it
                : undefined; // more than one -> collapse

        const nullEntries = memberEntries.filter(e => e == null).length;
        if (memberEntries.length == 0 || memberEntries.length == nullEntries)
            return (
                <Empty
                    style={{
                        background: 'radial-gradient(hsl(0deg 0% 100%) 40%, hsl(0deg 0% 97%) 90%)',
                        borderRadius: '5px',
                        padding: '1.5em'
                    }}
                >
                    {p.onlyShowPartitionsWithLag ? <span>All {memberEntries.length} members have been filtered (no lag on any partition).</span> : null}
                </Empty>
            );

        return (
            <Collapse bordered={false} defaultActiveKey={defaultExpand}>
                {memberEntries}
            </Collapse>
        );
    }
}

const renderMergedID = (id?: string, clientId?: string) => {
    if (clientId && id?.startsWith(clientId)) {
        // should always be true...
        const suffix = id.substring(clientId.length);

        return (
            <span className="consumerGroupCompleteID">
                <span className="consumerGroupName">{clientId}</span>
                <span className="consumerGroupSuffix">{suffix}</span>
            </span>
        );
    }
    // A client might be connected but it hasn't any assignments yet because it just joined the group
    else if (clientId) {
        return <span className="consumerGroupCompleteID">{clientId ?? id ?? ''}</span>;
    }

    return null;
};

const stateIcons = new Map<string, JSX.Element>([
    ['stable', <CheckCircleTwoTone key="stable" twoToneColor="#52c41a" />],
    ['completingrebalance', <HourglassTwoTone key="completingrebalance" twoToneColor="#52c41a" />],
    ['preparingrebalance', <HourglassTwoTone key="preparingrebalance" twoToneColor="orange" />],
    ['empty', <WarningTwoTone key="empty" twoToneColor="orange" />],
    ['dead', <FireTwoTone key="dead" twoToneColor="orangered" />],
    ['unknown', <QuestionCircleOutlined key="unknown" />]
]);
const makeStateEntry = (iconName: string, displayName: string, description: string): [any, any] => [
    <span key={`${iconName}-name`}>
        {stateIcons.get(iconName)} <span style={{ fontSize: '85%', fontWeight: 600 }}>{displayName}</span>
    </span>,
    <div key={`${iconName}-description`} style={{ maxWidth: '350px' }}>
        {description}
    </div>
];

const consumerGroupStateTable = QuickTable([makeStateEntry('stable', 'Stable', 'Consumer group has members which have been assigned partitions'), makeStateEntry('completingrebalance', 'Completing Rebalance', 'Kafka is assigning partitions to group members'), makeStateEntry('preparingrebalance', 'Preparing Rebalance', 'A reassignment of partitions is required, members have been asked to stop consuming'), makeStateEntry('empty', 'Empty', 'Consumer group exists, but does not have any members'), makeStateEntry('dead', 'Dead', 'Consumer group does not have any members and it\'s metadata has been removed'), makeStateEntry('unknown', 'Unknown', 'Group state is not known')], {
    gapHeight: '.5em',
    gapWidth: '.5em',
    keyStyle: { verticalAlign: 'top' }
});

export const GroupState = (p: { group: GroupDescription }) => {
    const state = p.group.state.toLowerCase();
    const icon = stateIcons.get(state);

    return (
        <Popover trigger="hover" size="auto" placement="right" hideCloseButton content={consumerGroupStateTable}>
            <span>
                {icon}
                <span> {p.group.state}</span>
            </span>
        </Popover>
    );
};
const ProtocolType = (p: { group: GroupDescription }) => {
    const protocol = p.group.protocolType;
    if (protocol == 'consumer') return null;

    return <Statistic title="Protocol" value={protocol} />;
};

function cannotEditGroupReason(group: GroupDescription): string | undefined {
    if (group.noEditPerms) return 'You don\'t have \'editConsumerGroup\' permissions for this group';
    if (group.isInUse) return 'Consumer groups with active members cannot be edited';
    if (!Features.patchGroup) return 'This cluster does not support editting group offsets';
}

function cannotDeleteGroupReason(group: GroupDescription): string | undefined {
    if (group.noDeletePerms) return 'You don\'t have \'deleteConsumerGroup\' permissions for this group';
    if (group.isInUse) return 'Consumer groups with active members cannot be deleted';
    if (!Features.deleteGroup) return 'This cluster does not support deleting groups';
}

function cannotDeleteGroupOffsetsReason(group: GroupDescription): string | undefined {
    if (group.noEditPerms) return 'You don\'t have \'deleteConsumerGroup\' permissions for this group';
    if (group.isInUse) return 'Consumer groups with active members cannot be deleted';
    if (!Features.deleteGroupOffsets) return 'This cluster does not support deleting group offsets';
}

export default GroupDetails;
