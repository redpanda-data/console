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
import type { ColumnFiltersState, PaginationState, SortingState, Updater } from '@tanstack/react-table';
import { MoreHorizontalIcon, TrashIcon } from 'components/icons';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { InputEnd, InputStart } from 'components/redpanda-ui/components/input';
import { ListLayout, ListLayoutFilters, ListLayoutSearchInput } from 'components/redpanda-ui/components/list-layout';
import { AlertCircle, AlertTriangle, DatabaseIcon, EyeOff, Search, X } from 'lucide-react';
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { toast } from 'sonner';
import { columnMeta, readColumnMeta } from 'utils/data-table-column-meta';

import { CreateTopicDialog } from './create-topic-dialog';
import { TopicListPagination } from './topic-list-pagination';
import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { type Topic, type TopicAction, TopicActions } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { setPageHeader } from '../../../state/ui-state';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import { renderLogDirSummary } from '../../misc/common';
import { Alert, AlertDescription, AlertTitle } from '../../redpanda-ui/components/alert';
import { Button } from '../../redpanda-ui/components/button';
import { Checkbox } from '../../redpanda-ui/components/checkbox';
import {
  type DataTableColumnDef,
  DataTableColumnHeader,
  type DataTableRow,
  useDataTable,
} from '../../redpanda-ui/components/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../redpanda-ui/components/dropdown-menu';
import { Skeleton } from '../../redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';
import { DeleteResourceAlertDialog } from '../../ui/delete-resource-alert-dialog';

const nameFilterFn = (row: DataTableRow<Topic>, columnId: string, filterValue: string) => {
  if (!filterValue) {
    return true;
  }
  try {
    return new RegExp(filterValue, 'i').test(String(row.getValue(columnId)));
  } catch {
    return String(row.getValue(columnId)).toLowerCase().includes(filterValue.toLowerCase());
  }
};

type SetPageIndex = (pageIndex: number) => unknown;

// Registers the page header and the global refresh handler for the topic list.
function useTopicListPage(refetchTopics: () => unknown) {
  useLayoutEffect(() => {
    setPageHeader('Topics', [{ title: 'Topics', linkTo: '/topics' }]);
  }, []);

  const refreshData = useCallback(() => {
    api.refreshClusterOverview();
    api.refreshClusterHealth().catch(() => {});
    refetchTopics();
  }, [refetchTopics]);

  useEffect(() => {
    appGlobal.onRefresh = refreshData;
  }, [refreshData]);

  return refreshData;
}

function useShowInternalTopics() {
  return useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        uiSettings.topicList.hideInternalTopics = val;
      },
      getDefaultValue: () => uiSettings.topicList.hideInternalTopics,
    },
    'showInternal',
    parseAsBoolean
  );
}

function useDeleteTopic(onDeleted: () => void) {
  const [topicToDelete, setTopicToDelete] = useState<Topic | null>(null);
  const [deletionPending, setDeletionPending] = useState(false);

  const handleDeleteTopic = (topicName: string) => {
    setDeletionPending(true);
    api
      .deleteTopic(topicName)
      .then(() => {
        toast.success('Topic deleted', {
          description: `Topic "${topicName}" has been deleted.`,
        });
        setTopicToDelete(null);
        onDeleted();
      })
      .catch((err: Error) => {
        toast.error('Failed to delete topic', { description: err.message });
      })
      .finally(() => setDeletionPending(false));
  };

  return { topicToDelete, setTopicToDelete, deletionPending, handleDeleteTopic };
}

function useVisibleTopics(topics: Topic[] | undefined, showInternalTopics: boolean | null) {
  const allTopics = useMemo(() => {
    let filtered = topics ?? [];
    if (!showInternalTopics) {
      filtered = filtered.filter((x) => !(x.isInternal || x.topicName.startsWith('_')));
    }
    return filtered;
  }, [topics, showInternalTopics]);

  const statistics = useMemo(
    () => ({
      topicCount: allTopics.length,
      partitionCount: allTopics.sum((x) => x.partitionCount),
      replicaCount: allTopics.sum((x) => x.partitionCount * x.replicationFactor),
    }),
    [allTopics]
  );

  return { allTopics, statistics };
}

function useTopicListPagination() {
  const [pageIndex, setPageIndex] = useQueryState('page', parseAsInteger.withDefault(0));

  const [pageSize, setPageSize] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        uiSettings.topicList.pageSize = val;
      },
      getDefaultValue: () => uiSettings.topicList.pageSize,
    },
    'pageSize',
    parseAsInteger.withDefault(DEFAULT_TABLE_PAGE_SIZE)
  );

  const pagination: PaginationState = { pageIndex, pageSize };

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    void setPageIndex(next.pageIndex);
    setPageSize(next.pageSize);
  };

  return { pageIndex, setPageIndex, pagination, handlePaginationChange };
}

function useTopicListSorting(setPageIndex: SetPageIndex) {
  const [sortId, setSortId] = useQueryStateWithCallback<string>(
    {
      onUpdate: (val) => {
        uiSettings.topicList.sortId = val;
      },
      getDefaultValue: () => uiSettings.topicList.sortId,
    },
    'sortId',
    parseAsString.withDefault('')
  );

  const [sortDesc, setSortDesc] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        uiSettings.topicList.sortDesc = val;
      },
      getDefaultValue: () => uiSettings.topicList.sortDesc,
    },
    'sortDesc',
    parseAsBoolean.withDefault(false)
  );

  const sorting: SortingState = sortId ? [{ id: sortId, desc: sortDesc }] : [];

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater;
    if (next.length > 0) {
      setSortId(next[0].id);
      setSortDesc(next[0].desc);
    } else {
      setSortId('');
      setSortDesc(false);
    }
    void setPageIndex(0);
  };

  return { sorting, handleSortingChange };
}

function useTopicNameFilter(setPageIndex: SetPageIndex) {
  const [searchValue, setSearchValue] = useQueryState('q', parseAsString.withDefault(''));
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    searchValue ? [{ id: 'topicName', value: searchValue }] : []
  );

  const handleColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = typeof updater === 'function' ? updater(columnFilters) : updater;
    setColumnFilters(next);
    void setPageIndex(0);
    const nameFilter = next.find((f) => f.id === 'topicName');
    setSearchValue((nameFilter?.value as string) || null);
  };

  return { columnFilters, handleColumnFiltersChange };
}

function buildTopicColumns(onDeleteTopic: (topic: Topic) => void): DataTableColumnDef<Topic>[] {
  return [
    {
      accessorKey: 'topicName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      filterFn: nameFilterFn,
      meta: columnMeta({ headWidth: 'full' as const }),
      cell: ({ row: { original: topic } }) => (
        <div className="flex items-start gap-2">
          <Link
            className="min-w-0 wrap-anywhere whitespace-normal"
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
      meta: columnMeta({ headWidth: 'sm' as const }),
      cell: ({ row: { original: topic } }) => topic.partitionCount,
    },
    {
      accessorKey: 'replicationFactor',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Replicas" />,
      meta: columnMeta({ headWidth: 'sm' as const }),
    },
    {
      accessorKey: 'cleanupPolicy',
      header: 'Cleanup Policy',
      enableSorting: false,
      meta: columnMeta({ headWidth: 'md' as const }),
    },
    {
      id: 'size',
      accessorFn: (topic) => topic.logDirSummary?.totalSizeBytes ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
      meta: columnMeta({ headWidth: 'sm' as const }),
      cell: ({ row: { original: topic } }) => renderLogDirSummary(topic.logDirSummary),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      meta: columnMeta({ align: 'right' as const, headWidth: 'fit' as const }),
      cell: ({ row: { original: topic } }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`Actions for ${topic.topicName}`}
                className="deleteButton"
                data-testid={`topic-actions-trigger-${topic.topicName}`}
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem
              data-testid={`delete-topic-button-${topic.topicName}`}
              disabled={!hasDeletePrivilege() || undefined}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTopic(topic);
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
}

function useTopicListTable({
  topics,
  onDeleteTopic,
  isReady,
}: {
  topics: Topic[];
  onDeleteTopic: (topic: Topic) => void;
  isReady: boolean;
}) {
  const { pageIndex, setPageIndex, pagination, handlePaginationChange } = useTopicListPagination();
  const { sorting, handleSortingChange } = useTopicListSorting(setPageIndex);
  const { columnFilters, handleColumnFiltersChange } = useTopicNameFilter(setPageIndex);
  const columns = buildTopicColumns(onDeleteTopic);

  const table = useDataTable({
    data: topics,
    columns,
    enableHiding: false,
    enableRowSelection: false,
    state: { sorting, pagination, columnFilters },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    onColumnFiltersChange: handleColumnFiltersChange,
    autoResetPageIndex: false,
  });

  const pageCount = table.getPageCount();
  useEffect(
    function clampPageIndex() {
      if (!isReady) {
        return;
      }
      const lastPageIndex = Math.max(0, pageCount - 1);
      if (pageIndex < 0 || pageIndex > lastPageIndex) {
        void setPageIndex(Math.max(0, Math.min(pageIndex, lastPageIndex)));
      }
    },
    [isReady, pageCount, pageIndex, setPageIndex]
  );

  return {
    table,
    columnCount: columns.length,
    isFiltered: columnFilters.length > 0,
    pageIndex,
    pageCount,
    setPageIndex,
  };
}

type TopicTableBodyProps = {
  table: ReturnType<typeof useTopicListTable>['table'];
  columnCount: number;
  showSkeleton: boolean;
  isFiltered: boolean;
  onCreateTopic: () => void;
};

const TopicTableBody = ({ table, columnCount, showSkeleton, isFiltered, onCreateTopic }: TopicTableBodyProps) => {
  if (showSkeleton) {
    return [0, 1, 2, 3, 4].map((i) => (
      <TableRow key={i}>
        {Array.from({ length: columnCount }, (_col, colIdx) => (
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
          const meta = readColumnMeta(cell.column.columnDef.meta);
          return (
            <TableCell
              align={meta?.align}
              className={cell.column.id === 'topicName' ? 'max-w-0 min-w-48' : undefined}
              key={cell.id}
              testId="data-table-cell"
            >
              {<table.FlexRender cell={cell} />}
            </TableCell>
          );
        })}
      </TableRow>
    ));
  }

  return (
    <TableRow>
      <TableCell colSpan={columnCount}>
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
              <Button onClick={onCreateTopic}>Create topic</Button>
            </EmptyContent>
          )}
        </Empty>
      </TableCell>
    </TableRow>
  );
};

const TopicList: FC = () => {
  const { data, isLoading, isError, error, refetch: refetchTopics } = useLegacyListTopicsQuery();
  const refreshData = useTopicListPage(refetchTopics);
  const [showInternalTopics, setShowInternalTopics] = useShowInternalTopics();
  const { allTopics, statistics } = useVisibleTopics(data.topics, showInternalTopics);
  const { topicToDelete, setTopicToDelete, deletionPending, handleDeleteTopic } = useDeleteTopic(refreshData);
  const [isCreateTopicModalOpen, setIsCreateTopicModalOpen] = useState(false);
  const { table, columnCount, isFiltered, pageIndex, pageCount, setPageIndex } = useTopicListTable({
    topics: allTopics,
    onDeleteTopic: setTopicToDelete,
    isReady: !(isLoading || isError),
  });

  if (isError && error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load topics</AlertTitle>
        <AlertDescription>{(error as Error).message}</AlertDescription>
      </Alert>
    );
  }

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

      <ListLayout className="my-4 min-h-0" data-testid="topics-table">
        <div className="flex flex-wrap gap-8">
          {(
            [
              { label: 'Total topics', value: statistics.topicCount },
              { label: 'Total partitions', value: statistics.partitionCount },
              { label: 'Total replicas', value: statistics.replicaCount },
            ] as const
          ).map(({ label, value }) => (
            <div className="flex flex-col gap-0.5" key={label}>
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
              <div className="text-body text-muted-foreground">{label}</div>
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
            {/* The slots stay mounted so the input's padding follows them: an empty slot measures 0. */}
            <ListLayoutSearchInput
              data-testid="search-field-input"
              onChange={(e) => table.getColumn('topicName')?.setFilterValue(e.target.value || undefined)}
              placeholder="Filter by name (regexp)..."
              value={(table.getColumn('topicName')?.getFilterValue() as string) ?? ''}
            >
              <InputStart>
                {!(table.getColumn('topicName')?.getFilterValue() as string) && (
                  <span className="text-muted-foreground" data-testid="search-field-search-icon">
                    <Search className="h-4 w-4" />
                  </span>
                )}
              </InputStart>
              <InputEnd className="pointer-events-auto">
                {(table.getColumn('topicName')?.getFilterValue() as string) && (
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    data-testid="search-field-reset-icon"
                    onClick={() => table.getColumn('topicName')?.setFilterValue(undefined)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </InputEnd>
            </ListLayoutSearchInput>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-body">
            <Checkbox
              checked={showInternalTopics}
              onCheckedChange={(checked) => {
                void setPageIndex(0);
                setShowInternalTopics(checked === true);
              }}
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
                  const meta = readColumnMeta(header.column.columnDef.meta);
                  return (
                    <TableHead align={meta?.align} key={header.id} width={meta?.headWidth}>
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            <TopicTableBody
              columnCount={columnCount}
              isFiltered={isFiltered}
              onCreateTopic={() => setIsCreateTopicModalOpen(true)}
              showSkeleton={isLoading || (pageCount > 0 && (pageIndex < 0 || pageIndex >= pageCount))}
              table={table}
            />
          </TableBody>
        </Table>

        <TopicListPagination table={table} />
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
          <TooltipTrigger
            render={
              <span className="inline-flex text-destructive">
                <AlertCircle aria-hidden="true" className="h-4 w-4" />
              </span>
            }
          />
          <TooltipContent>
            {`This topic has ${leaderlessPartitions.length} ${leaderlessPartitions.length === 1 ? 'a leaderless partition' : 'leaderless partitions'}`}
          </TooltipContent>
        </Tooltip>
      )}
      {!!underReplicatedPartitions && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex text-warning">
                <AlertTriangle aria-hidden="true" className="h-4 w-4" />
              </span>
            }
          />
          <TooltipContent>
            {`This topic has ${underReplicatedPartitions.length} ${underReplicatedPartitions.length === 1 ? 'an under-replicated partition' : 'under-replicated partitions'}`}
          </TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  );
};

const iconAllowed = <span className="text-success">✓</span>;
const iconForbidden = <span className="text-destructive">✗</span>;
const iconClosedEye = (
  <span className="ml-1 inline-block opacity-50">
    <EyeOff aria-hidden="true" className="inline h-3.5 w-3.5" />
  </span>
);

function countMissingActions(actions: TopicAction[]): number {
  let missing = 0;
  for (const a of TopicActions) {
    if (!actions.includes(a)) {
      missing += 1;
    }
  }
  return missing;
}

const TopicName = ({ topic }: { topic: Topic }) => {
  const actions = topic.allowedActions;

  if (!actions || actions[0] === 'all') {
    return <>{topic.topicName}</>;
  }

  if (countMissingActions(actions) === 0) {
    return <>{topic.topicName}</>;
  }

  const popoverContent = (
    <div className="text-body">
      <p className="mb-2 text-muted-foreground">
        You&apos;re missing permissions to view one or more aspects of this topic.
      </p>
      <div className="flex flex-col gap-0.5">
        {TopicActions.map((a) => (
          <div className="flex items-center justify-between gap-4" key={a}>
            <span className="text-body-sm font-semibold capitalize">{a}</span>
            {actions.includes(a) ? iconAllowed : iconForbidden}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="wrap-break-word whitespace-break-spaces">
              {topic.topicName}
              {iconClosedEye}
            </span>
          }
        />
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
