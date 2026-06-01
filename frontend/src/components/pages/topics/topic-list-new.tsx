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
  ListLayoutContent,
  ListLayoutFilters,
  ListLayoutPagination,
  ListLayoutSearchInput,
} from 'components/redpanda-ui/components/list-layout';
import { DatabaseIcon, Search, X } from 'lucide-react';
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
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../redpanda-ui/components/dialog';
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

const nameFilterFn = (row: Row<Topic>, columnId: string, filterValue: string) => {
  if (!filterValue) return true;
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
  const [isCreateTopicModalOpen, setIsCreateTopicModalOpen] = useState(false);

  const refreshData = useCallback(() => {
    api.refreshClusterOverview();
    api.refreshClusterHealth().catch(() => {});
    refetchTopics();
  }, [refetchTopics]);

  useEffect(() => {
    appGlobal.onRefresh = refreshData;
  }, [refreshData]);

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
      <ConfirmDeletionModal
        onCancel={() => setTopicToDelete(null)}
        onFinish={async () => {
          setTopicToDelete(null);
          await refreshData();
        }}
        topicToDelete={topicToDelete}
      />

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

        <ListLayoutContent>
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
        </ListLayoutContent>

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

  if (!(leaderlessPartitions || underReplicatedPartitions)) return null;

  return (
    <TooltipProvider>
      {!!leaderlessPartitions && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex text-destructive">
              <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <title>Error</title>
                <path
                  clipRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  fillRule="evenodd"
                />
              </svg>
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
              <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <title>Warning</title>
                <path
                  clipRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  fillRule="evenodd"
                />
              </svg>
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
    <svg aria-hidden="true" className="inline h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
      <title>Hidden</title>
      <path
        clipRule="evenodd"
        d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
        fillRule="evenodd"
      />
      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
    </svg>
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

function ConfirmDeletionModal({
  topicToDelete,
  onFinish,
  onCancel,
}: {
  topicToDelete: Topic | null;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const [deletionPending, setDeletionPending] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) onCancel();
  };

  const handleDelete = () => {
    if (!topicToDelete?.topicName) return;
    setDeletionPending(true);
    api
      .deleteTopic(topicToDelete.topicName)
      .then(() => {
        toast.success('Topic Deleted', {
          description: `Topic "${topicToDelete.topicName}" has been deleted.`,
        });
        onFinish();
      })
      .catch((err: Error) => {
        toast.error('Failed to delete topic', { description: err.message });
      })
      .finally(() => setDeletionPending(false));
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={topicToDelete !== null}>
      <DialogContent variant="destructive">
        <DialogHeader>
          <DialogTitle>Delete Topic</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {topicToDelete?.isInternal && (
            <Alert className="mb-3" variant="destructive">
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                This is an internal topic, deleting it might have unintended side-effects!
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm">
            Are you sure you want to delete topic{' '}
            <code className="rounded bg-muted px-1 font-mono text-sm">{topicToDelete?.topicName}</code>?<br />
            This action cannot be undone.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button
            data-testid="delete-topic-confirm-button"
            disabled={deletionPending}
            onClick={handleDelete}
            variant="destructive"
          >
            {deletionPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function hasDeletePrivilege() {
  // TODO - we will provide ACL for this
  return true;
}

export default TopicList;
