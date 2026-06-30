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
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { EditIcon, SkipIcon, TrashIcon } from 'components/icons';
import { Search, X } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

import { DeleteOffsetsModal, EditOffsetsModal, type GroupDeletingMode, type GroupOffset } from './modals';
import { appGlobal } from '../../../state/app-global';
import { api, useApiStoreHook } from '../../../state/backend-api';
import type { GroupDescription, GroupMemberDescription } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton, numberToThousandsString } from '../../../utils/tsx-utils';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import PageContent from '../../misc/page-content';
import { ShortNum } from '../../misc/short-num';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../redpanda-ui/components/accordion';
import { Button } from '../../redpanda-ui/components/button';
import { Card, CardContent } from '../../redpanda-ui/components/card';
import { Checkbox } from '../../redpanda-ui/components/checkbox';
import { CopyButton } from '../../redpanda-ui/components/copy-button';
import { DataTableColumnHeader, DataTablePagination } from '../../redpanda-ui/components/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../../redpanda-ui/components/empty';
import { ListLayoutSearchInput } from '../../redpanda-ui/components/list-layout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../redpanda-ui/components/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';
import { Text } from '../../redpanda-ui/components/typography';
import { cn } from '../../redpanda-ui/lib/utils';
import { ConsumerGroupStateCell } from '../../ui/consumer-group/consumer-group-state-cell';
import { PageComponent, type PageInitHelper } from '../page';
import AclList from '../topics/Tab.Acl/acl-list';

type GroupTab = 'topics' | 'acl';

type GroupSearchParams = {
  q?: string;
  withLag?: boolean;
  tab?: GroupTab;
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
    return (
      <GroupDetailsMain
        groupId={this.props.groupId}
        onSearchChange={this.props.onSearchChange}
        search={this.props.search}
      />
    );
  }
}

/**
 * Renders a button that is disabled with an explanatory tooltip when `reason` is set.
 * For `iconOnly` (table/heading action) buttons the disabled state renders as a `<span>`
 * (matching the legacy IconButton behavior the tests rely on); otherwise a disabled Button.
 */
const DisabledReasonButton = ({
  reason,
  testId,
  onClick,
  children,
  variant = 'ghost',
  size = 'icon-sm',
  iconOnly = false,
  className,
}: {
  reason?: string;
  testId?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  children: ReactNode;
  variant?: 'ghost' | 'outline' | 'link';
  size?: 'icon-sm' | 'sm' | 'md';
  iconOnly?: boolean;
  className?: string;
}) => {
  if (!reason) {
    return (
      <Button className={className} data-testid={testId} onClick={onClick} size={size} variant={variant}>
        {children}
      </Button>
    );
  }

  // Use a hoverable element (span / aria-disabled button) rather than a real `disabled`
  // button — disabled elements don't emit pointer events, so the tooltip would never show.
  const trigger = iconOnly ? (
    <span
      className={cn(
        'inline-flex h-8 w-8 cursor-not-allowed items-center justify-center text-muted-foreground opacity-50',
        className
      )}
      data-testid={testId}
    >
      {children}
    </span>
  ) : (
    <Button
      aria-disabled
      className={cn('cursor-not-allowed opacity-50', className)}
      data-testid={testId}
      onClick={(e) => e.preventDefault()}
      size={size}
      variant={variant}
    >
      {children}
    </Button>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={trigger} />
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const StatItem = ({ label, value }: { label: ReactNode; value: ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <div className="font-semibold text-lg tabular-nums">{value}</div>
    <Text className="text-muted-foreground text-sm">{label}</Text>
  </div>
);

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
  const showWithLagOnly = search?.withLag ?? false;
  const activeTab: GroupTab = search?.tab ?? 'topics';

  const groupId2 = decodeURIComponent(groupId);
  const consumerGroupsSize = useApiStoreHook((s) => s.consumerGroups.size);
  const group = useApiStoreHook((s) => s.consumerGroups.get(groupId2));
  const consumerGroupAcl = useApiStoreHook((s) => s.consumerGroupAcls.get(group?.groupId ?? ''));

  if (consumerGroupsSize === 0) {
    return DefaultSkeleton;
  }

  if (!group) {
    return DefaultSkeleton;
  }

  const totalPartitions = group.members.flatMap((m) => m.assignments).sum((a) => a.partitionIds?.length ?? 0);

  const editGroup = () => {
    const groupOffsets = group?.topicOffsets.flatMap((x) =>
      x.partitionOffsets.map(
        (p) =>
          ({
            topicName: x.topic,
            partitionId: p.partitionId,
            offset: p.groupOffset,
          }) as GroupOffset
      )
    );
    if (!groupOffsets) {
      return;
    }
    setEditedTopic(null);
    setEditedPartition(null);
    setEdittingOffsets(groupOffsets);
  };

  const deleteGroup = () => {
    const groupOffsets = group?.topicOffsets.flatMap((x) =>
      x.partitionOffsets.map(
        (p) =>
          ({
            topicName: x.topic,
            partitionId: p.partitionId,
            offset: p.groupOffset,
          }) as GroupOffset
      )
    );
    if (!groupOffsets) {
      return;
    }
    setDeletingOffsets(groupOffsets);
    setDeletingMode('group');
  };

  return (
    <PageContent className="groupDetails">
      <div className="flex gap-2">
        <DisabledReasonButton
          onClick={() => editGroup()}
          reason={cannotEditGroupReason(group, featurePatchGroup)}
          size="sm"
          variant="outline"
        >
          Edit Group
        </DisabledReasonButton>
        <DisabledReasonButton
          onClick={() => deleteGroup()}
          reason={cannotDeleteGroupReason(group, featureDeleteGroup)}
          size="sm"
          variant="outline"
        >
          Delete Group
        </DisabledReasonButton>
      </div>

      {/* Statistics Card */}
      {Boolean(uiSettings.consumerGroupDetails.showStatisticsBar) && (
        <Card className="gap-0 px-6 py-4" size="full" variant="standard">
          <CardContent className="flex flex-wrap gap-x-12 gap-y-4">
            <StatItem label="State" value={<ConsumerGroupStateCell state={group.state} />} />
            <StatItem label="Assigned Partitions" value={totalPartitions} />
            <StatItem label="Protocol" value={group.protocol || '—'} />
            <StatItem label="Protocol Type" value={group.protocolType || '—'} />
            <StatItem
              label={
                <span className="inline-flex items-center gap-1">
                  Coordinator ID
                  <CopyButton content={`${group.coordinatorId}`} size="icon" variant="ghost" />
                </span>
              }
              value={group.coordinatorId}
            />
            <StatItem label="Total Lag" value={numberToThousandsString(group.lagSum)} />
          </CardContent>
        </Card>
      )}

      {/* Main Card */}
      <Tabs onValueChange={(value) => onSearchChange({ tab: value as GroupTab })} value={activeTab}>
        <TabsList activeClassName="after:bg-foreground" className="w-fit" variant="underline">
          <TabsTrigger value="topics" variant="underline">
            Topics
          </TabsTrigger>
          <TabsTrigger value="acl" variant="underline">
            ACL
          </TabsTrigger>
        </TabsList>

        <TabsContent className="mt-4" value="topics">
          <div className="mb-6 flex items-center gap-4">
            <div className="relative w-[300px]">
              {!quickSearch && (
                <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground">
                  <Search className="h-4 w-4" />
                </span>
              )}
              <ListLayoutSearchInput
                className={quickSearch ? 'pr-8' : 'pl-8'}
                onChange={(e) => {
                  setQuickSearch(e.target.value);
                  onSearchChange({ q: e.target.value });
                }}
                placeholder="Filter by member"
                value={quickSearch}
              />
              {quickSearch && (
                <button
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setQuickSearch('');
                    onSearchChange({ q: '' });
                  }}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={showWithLagOnly}
                onCheckedChange={(checked) => onSearchChange({ withLag: checked === true })}
              />
              Only show topics with lag
            </label>
          </div>

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
        </TabsContent>

        <TabsContent className="mt-4" value="acl">
          <AclList acl={consumerGroupAcl} />
        </TabsContent>
      </Tabs>

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

type PartitionRow = {
  topicName: string;
  partitionId: number;
  groupOffset: number | null;
  highWaterMark: number | null;
  lag: number | null;
  assignedMember: GroupMemberDescription | undefined;
  id: string | undefined;
  clientId: string | undefined;
  host: string | undefined;
  isUnconsumed: boolean;
};

type PartitionTableProps = {
  partitions: PartitionRow[];
  group: GroupDescription;
  featurePatchGroup: boolean;
  featureDeleteGroupOffsets: boolean;
  onEditOffsets: (offsets: GroupOffset[]) => void;
  onDeleteOffsets: (offsets: GroupOffset[], mode: GroupDeletingMode) => void;
};

const PartitionTable = ({
  partitions,
  group,
  featurePatchGroup,
  featureDeleteGroupOffsets,
  onEditOffsets,
  onDeleteOffsets,
}: PartitionTableProps) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE });

  const columns: ColumnDef<PartitionRow>[] = [
    {
      accessorKey: 'partitionId',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Partition" />,
      meta: { headWidth: 'sm' as const },
    },
    {
      accessorKey: 'id',
      header: 'Assigned Member',
      enableSorting: false,
      meta: { headWidth: 'full' as const },
      cell: ({ row: { original } }) =>
        original.assignedMember ? (
          renderMergedID(original.id, original.clientId)
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <SkipIcon size={14} /> No assigned member
          </span>
        ),
    },
    {
      accessorKey: 'host',
      header: 'Host',
      enableSorting: false,
      cell: ({ row: { original } }) =>
        original.host ?? (
          <span className="text-muted-foreground opacity-60">
            <SkipIcon size={14} />
          </span>
        ),
    },
    {
      accessorKey: 'highWaterMark',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Log End Offset" />,
      meta: { headWidth: 'sm' as const },
      cell: ({ row: { original } }) =>
        original.highWaterMark !== null ? numberToThousandsString(original.highWaterMark) : '—',
    },
    {
      accessorKey: 'groupOffset',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Group Offset" />,
      meta: { headWidth: 'sm' as const },
      cell: ({ row: { original } }) =>
        original.groupOffset !== null ? numberToThousandsString(original.groupOffset) : '—',
    },
    {
      accessorKey: 'lag',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lag" />,
      meta: { headWidth: 'sm' as const },
      cell: ({ row: { original } }) => (original.lag !== null ? <ShortNum tooltip value={original.lag} /> : '—'),
    },
    {
      id: 'action',
      header: '',
      enableSorting: false,
      meta: { align: 'right' as const, headWidth: 'fit' as const },
      cell: ({ row: { original } }) => (
        <div className="flex justify-end gap-1">
          <DisabledReasonButton
            iconOnly
            onClick={() => onEditOffsets([original])}
            reason={cannotEditGroupReason(group, featurePatchGroup, original.isUnconsumed ? [] : undefined)}
            testId={`partition-edit-${original.partitionId}`}
          >
            <EditIcon size={16} />
          </DisabledReasonButton>
          <DisabledReasonButton
            iconOnly
            onClick={() => onDeleteOffsets([original], 'partition')}
            reason={cannotDeleteGroupOffsetsReason(
              group,
              featureDeleteGroupOffsets,
              original.isUnconsumed ? [] : undefined
            )}
            testId={`partition-delete-${original.partitionId}`}
          >
            <TrashIcon size={16} />
          </DisabledReasonButton>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: partitions,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                type Meta = { align?: 'right'; headWidth?: 'auto' | 'sm' | 'md' | 'lg' | 'xl' | 'fit' | 'full' };
                const meta = header.column.columnDef.meta as Meta | undefined;
                return (
                  <TableHead align={meta?.align} key={header.id} width={meta?.headWidth}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as { align?: 'right' } | undefined;
                return (
                  <TableCell align={meta?.align} key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {table.getPageCount() > 1 && <DataTablePagination table={table} />}
    </div>
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

  const lagsFlat: PartitionRow[] = topicLags.flatMap((topicLag) =>
    topicLag.partitionOffsets.map((partLag) => {
      const assignedMember = allAssignments.find(
        (e) => e.topicName === topicLag.topic && e.partitions.includes(partLag.partitionId)
      );
      const isUnconsumed = partLag.groupOffset === null;
      return {
        topicName: topicLag.topic,
        partitionId: partLag.partitionId,
        groupOffset: partLag.groupOffset,
        highWaterMark: partLag.highWaterMark as number | null,
        lag: isUnconsumed ? null : (partLag.lag as number | null),
        assignedMember: assignedMember?.member,
        id: assignedMember?.member.id,
        clientId: assignedMember?.member.clientId,
        host: assignedMember?.member.clientHost,
        isUnconsumed,
      };
    })
  );

  const lagGroupsByTopic = lagsFlat
    .filter((x) => !x.assignedMember || x.assignedMember?.id.match(quickSearchRegExp))
    .groupInto((e) => e.topicName)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((x) => ({ topicName: x.key, partitions: x.items }));

  const topicEntries = lagGroupsByTopic
    .map((g) => {
      const totalLagAll = g.partitions.sum((c) => c.lag ?? 0);
      const partitionsAssigned = g.partitions.filter((c) => c.assignedMember).length;

      const partitions = groupProps.onlyShowPartitionsWithLag
        ? g.partitions.filter((e) => e.isUnconsumed || (e.lag !== null && e.lag !== 0))
        : g.partitions;

      if (partitions.length === 0) {
        return null;
      }

      const consumedPartitions = g.partitions.filter((p) => !p.isUnconsumed);

      return { topicName: g.topicName, partitions, totalLagAll, partitionsAssigned, consumedPartitions };
    })
    .filterNull();

  if (topicEntries.length === 0) {
    return (
      <div className="rounded-lg border border-border border-solid bg-card py-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>{groupProps.onlyShowPartitionsWithLag ? 'No topics with lag' : 'No data found'}</EmptyTitle>
            <EmptyDescription>
              {groupProps.onlyShowPartitionsWithLag
                ? `All ${lagGroupsByTopic.length} topics have been filtered (no lag on any partition).`
                : 'This consumer group has no committed topic offsets.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  // Only one topic -> expand it by default; otherwise leave all collapsed.
  const defaultOpen = topicEntries.length === 1 ? [topicEntries[0].topicName] : [];

  return (
    <Accordion defaultValue={defaultOpen} variant="contained">
      {topicEntries.map((entry) => (
        <AccordionItem key={entry.topicName} value={entry.topicName}>
          <AccordionTrigger className="px-4 py-3">
            <div className="flex flex-col gap-1 text-start">
              <Text className="font-semibold text-lg">{entry.topicName}</Text>
              <div className="flex items-center gap-4 font-normal text-muted-foreground text-sm">
                <span>Lag: {numberToThousandsString(entry.totalLagAll)}</span>
                <span>Assigned partitions: {entry.partitionsAssigned}</span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {/* Topic-level actions live in the content (not nested inside the trigger button). */}
            <div className="mb-3 flex items-center justify-end gap-1">
              <DisabledReasonButton
                iconOnly
                onClick={() => groupProps.onEditOffsets(entry.consumedPartitions)}
                reason={cannotEditGroupReason(groupProps.group, featurePatchGroup, entry.consumedPartitions)}
              >
                <EditIcon size={16} />
              </DisabledReasonButton>
              <DisabledReasonButton
                iconOnly
                onClick={() => groupProps.onDeleteOffsets(entry.consumedPartitions, 'topic')}
                reason={cannotDeleteGroupOffsetsReason(
                  groupProps.group,
                  featureDeleteGroupOffsets,
                  entry.consumedPartitions
                )}
              >
                <TrashIcon size={16} />
              </DisabledReasonButton>
              <Button
                onClick={() => appGlobal.historyPush(`/topics/${encodeURIComponent(entry.topicName)}`)}
                size="sm"
                variant="link"
              >
                Go to topic
              </Button>
            </div>
            <PartitionTable
              featureDeleteGroupOffsets={featureDeleteGroupOffsets}
              featurePatchGroup={featurePatchGroup}
              group={groupProps.group}
              onDeleteOffsets={groupProps.onDeleteOffsets}
              onEditOffsets={groupProps.onEditOffsets}
              partitions={entry.partitions}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
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

function cannotEditGroupReason(
  group: GroupDescription,
  featurePatchGroup: boolean,
  consumedPartitions?: readonly unknown[]
): string | undefined {
  if (consumedPartitions !== undefined && consumedPartitions.length === 0) {
    return 'No committed offsets';
  }
  if (group.noEditPerms) {
    return "You don't have 'editConsumerGroup' permissions for this group";
  }
  if (group.isInUse) {
    return 'Offsets can only be edited while the group is Empty with no connected members.';
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
    return 'A consumer group can only be deleted while it is Empty with no connected members.';
  }
  if (!featureDeleteGroup) {
    return 'This cluster does not support deleting groups';
  }
}

function cannotDeleteGroupOffsetsReason(
  group: GroupDescription,
  featureDeleteGroupOffsets: boolean,
  consumedPartitions?: readonly unknown[]
): string | undefined {
  if (consumedPartitions !== undefined && consumedPartitions.length === 0) {
    return 'No committed offsets';
  }
  if (group.noEditPerms) {
    return "You don't have 'deleteConsumerGroup' permissions for this group";
  }
  if (group.isInUse) {
    return 'Offsets can only be deleted while the group is Empty with no connected members.';
  }
  if (!featureDeleteGroupOffsets) {
    return 'This cluster does not support deleting group offsets';
  }
}

export default GroupDetails;
