/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Link } from '@tanstack/react-router';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type Row,
  type SortingState,
  type Updater,
  useReactTable,
} from '@tanstack/react-table';
import { MoreHorizontalIcon, TrashIcon } from 'components/icons';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import {
  ListLayout,
  ListLayoutFilters,
  ListLayoutPagination,
  ListLayoutSearchInput,
} from 'components/redpanda-ui/components/list-layout';
import { AlertCircle, AlertTriangle, DatabaseIcon, EyeOff, Search, X } from 'lucide-react';
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { toast } from 'sonner';

import { CreateTopicDialog } from './create-topic-dialog';
import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { type Topic, TopicActions } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { setPageHeader } from '../../../state/ui-state';
import { renderLogDirSummary } from '../../misc/common';
import { Alert, AlertDescription, AlertTitle } from '../../redpanda-ui/components/alert';
import { Button } from '../../redpanda-ui/components/button';
import { Checkbox } from '../../redpanda-ui/components/checkbox';
import { DataTableColumnHeader, DataTablePagination } from '../../redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../redpanda-ui/components/dropdown-menu';
import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';
import { Text } from '../../redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from '../../ui/delete-resource-alert-dialog';

const nameFilterFn = (row: Row<Topic>, columnId: string, filterValue: string) => {
  if (!filterValue) {
    return true;
  }
  try {
    return new RegExp(filterValue, 'i').test(String(row.getValue(columnId)));
  } catch {
    return String(row.getValue(columnId)).toLowerCase().includes(filterValue.toLowerCase());
  }
};

const TopicList: FC = () => {
  useLayoutEffect(() => {
    setPageHeader('Topics', [{ title: 'Topics', linkTo: '/topics' }]);
  }, []);

  const [searchValue, setSearchValue] = useQueryState('q', parseAsString.withDefault(''));
  const [showInternalTopics, setShowInternalTopics] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        uiSettings.topicList.hideInternalTopics = val;
      },
      getDefaultValue: () => uiSettings.topicList.hideInternalTopics,
    },
    'showInternal',
    parseAsBoolean
  );

  const { data, isLoading, isError, error, refetch: refetchTopics } = useLegacyListTopicsQuery();
  const [topicToDelete, setTopicToDelete] = useState<Topic | null>(null);
  const [deletionPending, setDeletionPending] = useState(false);
  const [isCreateTopicModalOpen, setIsCreateTopicModalOpen] = useState(false);

  const refreshData = useCallback(() => {
    api.refreshClusterOverview();
    api.refreshClusterHealth().catch(() => {});
    refetchTopics();
  }, [refetchTopics]);

  useEffect(() => {
    appGlobal.onRefresh = refreshData;
  }, [refreshData]);

  const handleDeleteTopic = (topicName: string) => {
    setDeletionPending(true);
    api
      .deleteTopic(topicName)
      .then(() => {
        toast.success('Topic Deleted', {
          description: `Topic "${topicName}" has been deleted.`,
        });
        setTopicToDelete(null);
        refreshData();
      })
      .catch((err: Error) => {
        toast.error('Failed to delete topic', { description: err.message });
      })
      .finally(() => setDeletionPending(false));
  };

  const allTopics = useMemo(() => {
    let filtered = data.topics ?? [];
    if (!showInternalTopics) {
      filtered = filtered.filter((x) => !(x.isInternal || x.topicName.startsWith('_')));
    }
    return filtered;
  }, [data.topics, showInternalTopics]);

  const statistics = useMemo(
    () => ({
      topicCount: allTopics.length,
      partitionCount: allTopics.sum((x) => x.partitionCount),
      replicaCount: allTopics.sum((x) => x.partitionCount * x.replicationFactor),
    }),
    [allTopics]
  );

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(uiSettings.topicList.pageSize ?? 10);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    searchValue ? [{ id: 'topicName', value: searchValue }] : []
  );

  const pagination: PaginationState = { pageIndex, pageSize };

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    setPageIndex(next.pageIndex);
    setPageSize(next.pageSize);
    uiSettings.topicList.pageSize = next.pageSize;
  };

  const handleColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = typeof updater === 'function' ? updater(columnFilters) : updater;
    setColumnFilters(next);
    const nameFilter = next.find((f) => f.id === 'topicName');
    setSearchValue((nameFilter?.value as string) || null);
  };

  const columns: ColumnDef<Topic>[] = [
    {
      accessorKey: 'topicName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      filterFn: nameFilterFn,
      meta: { headWidth: 'full' as const },
      cell: ({ row: { original: topic } }) => (
        <div className="flex items-start gap-2">
          <Link
            className="text-inherit no-underline hover:no-underline"
            data-testid={`topic-link-${topic.topicName}`}
            params={{ topicName: encodeURIComponent(topic.topicName) }}
            search={{} as never}
            to="/topics/$topicName"
          >
            <TopicName topic={topic} />
          </Link>
          <TopicHealthIcons topic={topic} />
        </div>
      ),
    },
    {
      accessorKey: 'partitionCount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Partitions" />,
      meta: { headWidth: 'sm' as const },
      cell: ({ row: { original: topic } }) => topic.partitionCount,
    },
    {
      accessorKey: 'replicationFactor',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Replicas" />,
      meta: { headWidth: 'sm' as const },
    },
    {
      accessorKey: 'cleanupPolicy',
      header: 'Cleanup Policy',
      enableSorting: false,
      meta: { headWidth: 'md' as const },
    },
    {
      id: 'size',
      accessorFn: (topic) => topic.logDirSummary?.totalSizeBytes ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
      meta: { headWidth: 'sm' as const },
      cell: ({ row: { original: topic } }) => renderLogDirSummary(topic.logDirSummary),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: { align: 'right' as const, headWidth: 'fit' as const },
      cell: ({ row: { original: topic } }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="deleteButton"
              data-testid={`topic-actions-trigger-${topic.topicName}`}
              size="icon-sm"
              variant="ghost"
            >
              <MoreHorizontalIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              data-testid={`delete-topic-button-${topic.topicName}`}
              disabled={!hasDeletePrivilege() || undefined}
              onClick={(e) => {
                e.stopPropagation();
                setTopicToDelete(topic);
              }}
              variant="destructive"
            >
              <TrashIcon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const table = useReactTable({
    data: allTopics,
    columns,
    state: { sorting, pagination, columnFilters },
    onSortingChange: setSorting,
    onPaginationChange: handlePaginationChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (isError && error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load topics</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

  const renderBody = () => {
    if (isLoading) {
      return [0, 1, 2, 3, 4].map((i) => (
        <TableRow key={i}>
          {columns.map((_col, colIdx) => (
            <TableCell key={colIdx}>
              <Skeleton variant="text" width="md" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }

    if (table.getRowModel().rows.length) {
      return table.getRowModel().rows.map((row) => (
        <TableRow key={row.id}>
          {row.getVisibleCells().map((cell) => {
            const meta = cell.column.columnDef.meta as { align?: 'right' } | undefined;
            return (
              <TableCell align={meta?.align} key={cell.id} testId="data-table-cell">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            );
          })}
        </TableRow>
      ));
    }

    const isFiltered = columnFilters.length > 0;
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columns.length}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <DatabaseIcon />
              </EmptyMedia>
              <EmptyTitle>{isFiltered ? 'No topics match your search' : 'No topics yet'}</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? 'Try adjusting your search term.'
                  : 'Create your first topic to start publishing and consuming messages.'}
              </EmptyDescription>
            </EmptyHeader>
            {!isFiltered && (
              <EmptyContent>
                <Button onClick={() => setIsCreateTopicModalOpen(true)}>Create topic</Button>
              </EmptyContent>
            )}
          </Empty>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <>
      <CreateTopicDialog isOpen={isCreateTopicModalOpen} onClose={() => setIsCreateTopicModalOpen(false)} />
      <DeleteResourceAlertDialog
        confirmButtonTestId="delete-topic-confirm-button"
        isDeleting={deletionPending}
        onDelete={handleDeleteTopic}
        onOpenChange={(open) => {
          if (!open) {
            setTopicToDelete(null);
          }
        }}
        open={topicToDelete !== null}
        resourceId={topicToDelete?.topicName ?? ''}
        resourceName={topicToDelete?.topicName ?? ''}
        resourceType="Topic"
      >
        {topicToDelete?.isInternal ? (
          <Alert className="mb-3" variant="destructive">
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              This is an internal topic, deleting it might have unintended side-effects!
            </AlertDescription>
          </Alert>
        ) : null}
      </DeleteResourceAlertDialog>

      <ListLayout className="my-4" data-testid="topics-table">
        <div className="flex flex-wrap gap-8">
          {(
            [
              { label: 'Total topics', value: statistics.topicCount },
              { label: 'Total partitions', value: statistics.partitionCount },
              { label: 'Total replicas', value: statistics.replicaCount },
            ] as const
          ).map(({ label, value }) => (
            <div className="flex flex-col gap-0.5" key={label}>
              <Text className="font-semibold text-2xl tabular-nums">{value}</Text>
              <Text className="text-muted-foreground text-sm">{label}</Text>
            </div>
          ))}
        </div>

        <ListLayoutFilters
          actions={
            <Button data-testid="create-topic-button" onClick={() => setIsCreateTopicModalOpen(true)}>
              Create topic
            </Button>
          }
        >
          <div className="relative">
            {!(table.getColumn('topicName')?.getFilterValue() as string) && (
              <span
                className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground"
                data-testid="search-field-search-icon"
              >
                <Search className="h-4 w-4" />
              </span>
            )}
            <ListLayoutSearchInput
              className={(table.getColumn('topicName')?.getFilterValue() as string) ? 'pr-8' : 'pl-8'}
              data-testid="search-field-input"
              onChange={(e) => table.getColumn('topicName')?.setFilterValue(e.target.value || undefined)}
              placeholder="Filter by name (regexp)..."
              value={(table.getColumn('topicName')?.getFilterValue() as string) ?? ''}
            />
            {(table.getColumn('topicName')?.getFilterValue() as string) && (
              <button
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="search-field-reset-icon"
                onClick={() => table.getColumn('topicName')?.setFilterValue(undefined)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={showInternalTopics}
              onCheckedChange={(checked) => setShowInternalTopics(checked === true)}
              testId="show-internal-topics-checkbox"
            />
            Show internal topics
          </label>
        </ListLayoutFilters>

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
          <TableBody>{renderBody()}</TableBody>
        </Table>

        <ListLayoutPagination>
          <DataTablePagination table={table} />
        </ListLayoutPagination>
      </ListLayout>
    </>
  );
};

const TopicHealthIcons = ({ topic }: { topic: Topic }) => {
  const leaderlessPartitions = (api.clusterHealth?.leaderlessPartitions ?? []).find(
    ({ topicName }) => topicName === topic.topicName
  )?.partitionIds;
  const underReplicatedPartitions = (api.clusterHealth?.underReplicatedPartitions ?? []).find(
    ({ topicName }) => topicName === topic.topicName
  )?.partitionIds;

  if (!(leaderlessPartitions || underReplicatedPartitions)) {
    return null;
  }

  return (
    <TooltipProvider>
      {!!leaderlessPartitions && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex text-destructive">
              <AlertCircle aria-hidden="true" className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {`This topic has ${leaderlessPartitions.length} ${leaderlessPartitions.length === 1 ? 'a leaderless partition' : 'leaderless partitions'}`}
          </TooltipContent>
        </Tooltip>
      )}
      {!!underReplicatedPartitions && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex text-warning">
              <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {`This topic has ${underReplicatedPartitions.length} ${underReplicatedPartitions.length === 1 ? 'an under-replicated partition' : 'under-replicated partitions'}`}
          </TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  );
};

const iconAllowed = <span className="text-green-600">✓</span>;
const iconForbidden = <span className="text-red-600">✗</span>;
const iconClosedEye = (
  <span className="ml-1 inline-block opacity-50">
    <EyeOff aria-hidden="true" className="inline h-3.5 w-3.5" />
  </span>
);

const TopicName = ({ topic }: { topic: Topic }) => {
  const actions = topic.allowedActions;

  if (!actions || actions[0] === 'all') {
    return <>{topic.topicName}</>;
  }

  let missing = 0;
  for (const a of TopicActions) {
    if (!actions.includes(a)) {
      missing += 1;
    }
  }

  if (missing === 0) {
    return <>{topic.topicName}</>;
  }

  const popoverContent = (
    <div className="text-sm">
      <p className="mb-2 text-muted-foreground">
        You&apos;re missing permissions to view one or more aspects of this topic.
      </p>
      <div className="flex flex-col gap-0.5">
        {TopicActions.map((a) => (
          <div className="flex items-center justify-between gap-4" key={a}>
            <span className="font-semibold text-xs capitalize">{a}</span>
            {actions.includes(a) ? iconAllowed : iconForbidden}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="whitespace-break-spaces break-words">
            {topic.topicName}
            {iconClosedEye}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{popoverContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

function hasDeletePrivilege() {
  // TODO - we will provide ACL for this
  return true;
}

export default TopicList;
