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

import {
  Accordion,
  Checkbox,
  CopyButton,
  DataTable,
  Empty,
  Flex,
  Grid,
  GridItem,
  Popover,
  SearchField,
  Section,
  Tabs,
  Text,
} from '@redpanda-data/ui';
import {
  CheckCircleIcon,
  EditIcon,
  FlameIcon,
  HelpIcon,
  HourglassIcon,
  SkipIcon,
  TrashIcon,
  WarningIcon,
} from 'components/icons';
import React, { useMemo, useState } from 'react';

import { DeleteOffsetsModal, EditOffsetsModal, type GroupDeletingMode, type GroupOffset } from './modals';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { GroupDescription, GroupMemberDescription } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { uiSettings } from '../../../state/ui';
import { Button, DefaultSkeleton, IconButton, numberToThousandsString } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import { ShortNum } from '../../misc/short-num';
import { Statistic } from '../../misc/statistic';
import { PageComponent, type PageInitHelper } from '../page';
import AclList from '../topics/Tab.Acl/acl-list';

type GroupSearchParams = {
  q?: string;
  withLag?: boolean;
};

const DEFAULT_MATCH_ALL_REGEX = /.*/s;
const QUICK_SEARCH_REGEX_CACHE = new Map<string, RegExp>();

function getQuickSearchRegex(pattern: string): RegExp {
  if (QUICK_SEARCH_REGEX_CACHE.has(pattern)) {
    // biome-ignore lint/style/noNonNullAssertion: cache hit guarantees value exists
    return QUICK_SEARCH_REGEX_CACHE.get(pattern)!;
  }
  let regExp = DEFAULT_MATCH_ALL_REGEX; // match everything by default
  try {
    regExp = new RegExp(pattern, 'i');
  } catch (_e) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('Invalid expression');
  }
  QUICK_SEARCH_REGEX_CACHE.set(pattern, regExp);
  return regExp;
}

type GroupDetailsProps = {
  groupId: string;
  search: GroupSearchParams;
  onSearchChange: (updates: Partial<GroupSearchParams>) => void;
};

class GroupDetails extends PageComponent<GroupDetailsProps> {
  initPage(p: PageInitHelper): void {
    const group = decodeURIComponent(this.props.groupId);

    p.title = this.props.groupId;
    p.addBreadcrumb('Consumer Groups', '/groups');
    if (group) {
      p.addBreadcrumb(group, `/${group}`, undefined, {
        canBeCopied: true,
        canBeTruncated: true,
      });
    }

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    const group = decodeURIComponent(this.props.groupId);
    api.refreshConsumerGroup(group, force);
    api.refreshConsumerGroupAcls(group, force);
  }

  render() {
    // Touch observables so PageComponent's Reaction tracks them for re-renders.
    void api.consumerGroups;
    void api.consumerGroupAcls;
    return (
      <GroupDetailsMain
        groupId={this.props.groupId}
        onSearchChange={this.props.onSearchChange}
        search={this.props.search}
      />
    );
  }
}

const GroupDetailsMain = ({ groupId, search, onSearchChange }: GroupDetailsProps) => {
  const featurePatchGroup = useSupportedFeaturesStore((s) => s.patchGroup);
  const featureDeleteGroup = useSupportedFeaturesStore((s) => s.deleteGroup);
  const [editState, setEditState] = useState<{
    offsets: GroupOffset[] | null;
    topic: string | null;
    partition: number | null;
  }>({ offsets: null, topic: null, partition: null });
  const edittingOffsets = editState.offsets;
  const editedTopic = editState.topic;
  const editedPartition = editState.partition;
  const setEdittingOffsets = (v: GroupOffset[] | null) => setEditState((prev) => ({ ...prev, offsets: v }));
  const setEditedTopic = (v: string | null) => setEditState((prev) => ({ ...prev, topic: v }));
  const setEditedPartition = (v: number | null) => setEditState((prev) => ({ ...prev, partition: v }));
  const [deletingState, setDeletingState] = useState<{ mode: GroupDeletingMode; offsets: GroupOffset[] | null }>({
    mode: 'group',
    offsets: null,
  });
  const deletingMode = deletingState.mode;
  const deletingOffsets = deletingState.offsets;
  const setDeletingMode = (v: GroupDeletingMode) => setDeletingState((prev) => ({ ...prev, mode: v }));
  const setDeletingOffsets = (v: GroupOffset[] | null) => setDeletingState((prev) => ({ ...prev, offsets: v }));
  const [quickSearch, setQuickSearch] = useState(search?.q ?? '');
  const [showWithLagOnly, setShowWithLagOnly] = useState(search?.withLag ?? false);

  if (api.consumerGroups.size === 0) {
    return DefaultSkeleton;
  }

  const groupId2 = decodeURIComponent(groupId);
  const group = api.consumerGroups.get(groupId2);
  if (!group) {
    return DefaultSkeleton;
  }

  const totalPartitions = group.members.flatMap((m) => m.assignments).sum((a) => a.partitionIds?.length ?? 0);

  const editGroup = () => {
    const groupOffsets = group?.topicOffsets.flatMap((x) =>
      x.partitionOffsets.map(
        (p) => ({ topicName: x.topic, partitionId: p.partitionId, offset: p.groupOffset }) as GroupOffset
      )
    );
    if (!groupOffsets) return;
    setEditedTopic(null);
    setEditedPartition(null);
    setEdittingOffsets(groupOffsets);
  };

  const deleteGroup = () => {
    const groupOffsets = group?.topicOffsets.flatMap((x) =>
      x.partitionOffsets.map(
        (p) => ({ topicName: x.topic, partitionId: p.partitionId, offset: p.groupOffset }) as GroupOffset
      )
    );
    if (!groupOffsets) return;
    setDeletingOffsets(groupOffsets);
    setDeletingMode('group');
  };

  return (
    <PageContent className="groupDetails">
      <Flex gap={2}>
        <Button disabledReason={cannotEditGroupReason(group, featurePatchGroup)} onClick={() => editGroup()} variant="outline">
          Edit Group
        </Button>
        <Button disabledReason={cannotDeleteGroupReason(group, featureDeleteGroup)} onClick={() => deleteGroup()} variant="outline">
          Delete Group
        </Button>
      </Flex>
      {/* Statistics Card */}
      {Boolean(uiSettings.consumerGroupDetails.showStatisticsBar) && (
        <Section py={4}>
          <div className="statisticsBar">
            <Flex gap="2rem" justifyContent="space-between">
              <Statistic title="State" value={<GroupState group={group} />} />
              <Statistic title="Assigned Partitions" value={totalPartitions} />
              <ProtocolType group={group} />
              <Statistic title="Protocol Type" value={group.protocolType} />
              <Statistic
                title={
                  <Flex alignItems="center" gap={1}>
                    Coordinator ID <CopyButton content={`${group.coordinatorId}`} variant="sm" />
                  </Flex>
                }
                value={group.coordinatorId}
              />
              <Statistic title="Total Lag" value={numberToThousandsString(group.lagSum)} />
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
              key: 'topics',
              name: 'Topics',
              component: (
                <>
                  <Flex alignItems="center" gap={4} mb={6}>
                    <SearchField
                      placeholderText="Filter by member"
                      searchText={quickSearch}
                      setSearchText={(filterText) => {
                        setQuickSearch(filterText);
                        onSearchChange({ q: filterText });
                      }}
                      width={300}
                    />
                    <Checkbox
                      isChecked={showWithLagOnly}
                      onChange={(e) => {
                        setShowWithLagOnly(e.target.checked);
                        onSearchChange({ withLag: e.target.checked });
                      }}
                    >
                      Only show topics with lag
                    </Checkbox>
                  </Flex>

                  <GroupByTopics
                    group={group}
                    onDeleteOffsets={(offsets, mode) => {
                      setDeletingMode(mode);
                      setDeletingOffsets(offsets);
                    }}
                    onEditOffsets={(g) => {
                      editGroup();
                      setEditedTopic(g[0].topicName);
                      if (g.length === 1) {
                        setEditedPartition(g[0].partitionId);
                      } else {
                        setEditedPartition(null);
                      }
                    }}
                    onlyShowPartitionsWithLag={showWithLagOnly}
                    quickSearch={quickSearch}
                  />
                </>
              ),
            },
            {
              key: 'acl',
              name: 'ACL',
              component: <AclList acl={api.consumerGroupAcls.get(group.groupId)} />,
            },
          ]}
          variant="fitted"
        />
      </Section>

      {/* Modals */}
      <EditOffsetsModal
        group={group}
        initialPartition={editedPartition}
        initialTopic={editedTopic}
        key={`${editedTopic ?? ''}-${editedPartition ?? ''}`}
        offsets={edittingOffsets}
        onClose={() => {
          setEdittingOffsets(null);
        }}
      />
      <DeleteOffsetsModal
        disabledReason={cannotDeleteGroupReason(group, featureDeleteGroup)}
        group={group}
        mode={deletingMode}
        offsets={deletingOffsets}
        onClose={() => {
          setDeletingOffsets(null);
        }}
        onInit={() => deleteGroup()}
      />
    </PageContent>
  );
};

const GroupByTopics = (groupProps: {
  group: GroupDescription;
  onlyShowPartitionsWithLag: boolean;
  quickSearch: string;
  onEditOffsets: (offsets: GroupOffset[]) => void;
  onDeleteOffsets: (offsets: GroupOffset[], mode: GroupDeletingMode) => void;
}) => {
  const featurePatchGroup = useSupportedFeaturesStore((s) => s.patchGroup);
  const featureDeleteGroupOffsets = useSupportedFeaturesStore((s) => s.deleteGroupOffsets);
  const quickSearchRegExp = useMemo(() => getQuickSearchRegex(groupProps.quickSearch), [groupProps.quickSearch]);

  const topicLags = groupProps.group.topicOffsets;
  const allAssignments = groupProps.group.members.flatMap((m) =>
    m.assignments.map((as) => ({ member: m, topicName: as.topicName, partitions: as.partitionIds ?? [] }))
  );

  const lagsFlat = topicLags.flatMap((topicLag) =>
    topicLag.partitionOffsets.map((partLag) => {
      const assignedMember = allAssignments.find(
        (e) => e.topicName === topicLag.topic && e.partitions.includes(partLag.partitionId)
      );

      return {
        topicName: topicLag.topic,
        partitionId: partLag.partitionId,
        groupOffset: partLag.groupOffset,
        highWaterMark: partLag.highWaterMark,
        lag: partLag.lag,

        assignedMember: assignedMember?.member,
        id: assignedMember?.member.id,
        clientId: assignedMember?.member.clientId,
        host: assignedMember?.member.clientHost,
      };
    })
  );

  const lagGroupsByTopic = lagsFlat
    .filter((x) => !x.assignedMember || x.assignedMember?.id.match(quickSearchRegExp))
    .groupInto((e) => e.topicName)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((x) => ({ topicName: x.key, partitions: x.items }));

  const topicEntries = lagGroupsByTopic.map((g) => {
    const totalLagAll = g.partitions.sum((c) => c.lag ?? 0);
    const partitionsAssigned = g.partitions.filter((c) => c.assignedMember).length;

    const partitions = groupProps.onlyShowPartitionsWithLag ? g.partitions.filter((e) => e.lag !== 0) : g.partitions;

    if (partitions.length === 0) {
      return null;
    }

    return {
      heading: (
        <Flex flexDirection="column" gap={4}>
          <Flex gap={2}>
            {/* Title */}
            <Text fontSize="lg" fontWeight={600}>
              {g.topicName}
            </Text>

            <Flex gap={2}>
              <IconButton
                disabledReason={cannotEditGroupReason(groupProps.group, featurePatchGroup)}
                onClick={(e) => {
                  groupProps.onEditOffsets(g.partitions);
                  e.stopPropagation();
                }}
              >
                <EditIcon />
              </IconButton>
              <IconButton
                disabledReason={cannotDeleteGroupOffsetsReason(groupProps.group, featureDeleteGroupOffsets)}
                onClick={(e) => {
                  groupProps.onDeleteOffsets(g.partitions, 'topic');
                  e.stopPropagation();
                }}
              >
                <TrashIcon />
              </IconButton>
            </Flex>
          </Flex>
          <Flex alignItems="center" color="gray.600" fontSize="sm" fontWeight="normal" gap={4}>
            <span>Lag: {numberToThousandsString(totalLagAll)}</span>
            <span>Assigned partitions: {partitionsAssigned}</span>
            <Button
              onClick={() => appGlobal.historyPush(`/topics/${encodeURIComponent(g.topicName)}`)}
              size="sm"
              variant="link"
            >
              Go to topic
            </Button>
          </Flex>
        </Flex>
      ),
      description: (
        <DataTable<{
          topicName: string;
          partitionId: number;
          groupOffset: number;
          highWaterMark: number;
          lag: number;
          assignedMember: GroupMemberDescription | undefined;
          id: string | undefined;
          clientId: string | undefined;
          host: string | undefined;
        }>
          columns={[
            {
              size: 100,
              header: 'Partition',
              accessorKey: 'partitionId',
            },
            {
              size: Number.POSITIVE_INFINITY,
              header: 'Assigned Member',
              accessorKey: 'id',
              cell: ({
                row: {
                  original: { assignedMember, id, clientId },
                },
              }) =>
                assignedMember ? (
                  renderMergedID(id, clientId)
                ) : (
                  <span style={{ margin: '0 3px' }}>
                    <SkipIcon /> No assigned member
                  </span>
                ),
            },
            {
              header: 'Host',
              accessorKey: 'host',
              cell: ({
                row: {
                  original: { host },
                },
              }) =>
                host ?? (
                  <span style={{ opacity: 0.66, margin: '0 3px' }}>
                    <SkipIcon />
                  </span>
                ),
            },
            {
              size: 120,
              header: 'Log End Offset',
              accessorKey: 'highWaterMark',
              cell: ({ row: { original } }) => numberToThousandsString(original.highWaterMark),
            },
            {
              size: 120,
              header: 'Group Offset',
              accessorKey: 'groupOffset',
              cell: ({ row: { original } }) => numberToThousandsString(original.groupOffset),
            },
            {
              size: 80,
              header: 'Lag',
              accessorKey: 'lag',
              cell: ({ row: { original } }) => ShortNum({ value: original.lag, tooltip: true }),
            },
            {
              size: 1,
              header: '',
              id: 'action',
              cell: ({ row: { original } }) => (
                <Flex gap={1} pr={2}>
                  <IconButton
                    disabledReason={cannotEditGroupReason(groupProps.group, featurePatchGroup)}
                    onClick={() => groupProps.onEditOffsets([original])}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    disabledReason={cannotDeleteGroupOffsetsReason(groupProps.group, featureDeleteGroupOffsets)}
                    onClick={() => groupProps.onDeleteOffsets([original], 'partition')}
                  >
                    <TrashIcon />
                  </IconButton>
                </Flex>
              ),
            },
          ]}
          data={partitions}
          pagination
          sorting
        />
      ),
    };
  });

  const defaultExpand: number | undefined =
    lagGroupsByTopic.length === 1
      ? 0 // only one -> expand
      : undefined; // more than one -> collapse

  const nullEntries = topicEntries.filter((e) => e === null).length;
  if (topicEntries.length === 0 || topicEntries.length === nullEntries) {
    return (
      <Empty
        description={
          groupProps.onlyShowPartitionsWithLag ? (
            <span>All {topicEntries.length} topics have been filtered (no lag on any partition).</span>
          ) : (
            'No data found'
          )
        }
      />
    );
  }

  return <Accordion allowToggle defaultIndex={defaultExpand} items={topicEntries.filterNull()} />;
};

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
  if (clientId) {
    return <span className="consumerGroupCompleteID">{clientId ?? id ?? ''}</span>;
  }

  return null;
};

type StateIcon = 'stable' | 'completingrebalance' | 'preparingrebalance' | 'empty' | 'dead' | 'unknown';

const stateIcons = new Map<StateIcon, JSX.Element>([
  ['stable', <CheckCircleIcon color="#52c41a" key="stable" size={16} />],
  ['completingrebalance', <HourglassIcon color="#52c41a" key="completingrebalance" size={16} />],
  ['preparingrebalance', <HourglassIcon color="orange" key="preparingrebalance" size={16} />],
  ['empty', <WarningIcon color="orange" key="empty" size={16} />],
  ['dead', <FlameIcon color="orangered" key="dead" size={16} />],
  ['unknown', <HelpIcon key="unknown" size={16} />],
]);

const stateIconNames: Record<StateIcon, string> = {
  stable: 'Stable',
  completingrebalance: 'Completing Rebalance',
  preparingrebalance: 'Preparing Rebalance',
  empty: 'Empty',
  dead: 'Dead',
  unknown: 'Unknown',
};

const stateIconDescriptions: Record<StateIcon, string> = {
  stable: 'Consumer group has members which have been assigned partitions',
  completingrebalance: 'Kafka is assigning partitions to group members',
  preparingrebalance: 'A reassignment of partitions is required, members have been asked to stop consuming',
  empty: 'Consumer group exists, but does not have any members',
  dead: 'Consumer group does not have any members and its metadata has been removed',
  unknown: 'Group state is not known',
};

const consumerGroupStateTable = (
  <Grid gap={4} templateColumns="auto 300px">
    {Array.from(stateIcons.entries()).map(([key, icon]) => (
      <React.Fragment key={key}>
        {/* Icon column */}
        <GridItem alignItems="center" display="flex" gap={2}>
          {icon} <strong>{stateIconNames[key]}</strong>
        </GridItem>

        {/* Description column */}
        <GridItem>{stateIconDescriptions[key]}</GridItem>
      </React.Fragment>
    ))}
  </Grid>
);

export const GroupState = (p: { group: GroupDescription }) => {
  const state = p.group.state.toLowerCase();
  const icon = stateIcons.get(state as StateIcon);

  return (
    <Popover content={consumerGroupStateTable} hideCloseButton isInPortal placement="right" size="auto" trigger="hover">
      <Flex alignItems="center" gap={2}>
        {icon}
        <span> {p.group.state}</span>
      </Flex>
    </Popover>
  );
};
const ProtocolType = (p: { group: GroupDescription }) => {
  const protocol = p.group.protocolType;
  if (protocol === 'consumer') {
    return null;
  }

  return <Statistic title="Protocol" value={protocol} />;
};

function cannotEditGroupReason(group: GroupDescription, featurePatchGroup: boolean): string | undefined {
  if (group.noEditPerms) {
    return "You don't have 'editConsumerGroup' permissions for this group";
  }
  if (group.isInUse) {
    return 'Consumer groups with active members cannot be edited';
  }
  if (!featurePatchGroup) {
    return 'This cluster does not support editing group offsets';
  }
}

function cannotDeleteGroupReason(group: GroupDescription, featureDeleteGroup: boolean): string | undefined {
  if (group.noDeletePerms) {
    return "You don't have 'deleteConsumerGroup' permissions for this group";
  }
  if (group.isInUse) {
    return 'Consumer groups with active members cannot be deleted';
  }
  if (!featureDeleteGroup) {
    return 'This cluster does not support deleting groups';
  }
}

function cannotDeleteGroupOffsetsReason(group: GroupDescription, featureDeleteGroupOffsets: boolean): string | undefined {
  if (group.noEditPerms) {
    return "You don't have 'deleteConsumerGroup' permissions for this group";
  }
  if (group.isInUse) {
    return 'Consumer groups with active members cannot be deleted';
  }
  if (!featureDeleteGroupOffsets) {
    return 'This cluster does not support deleting group offsets';
  }
}

export default GroupDetails;
