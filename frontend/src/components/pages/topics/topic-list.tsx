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

import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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
import { BanIcon, CheckIcon, ErrorIcon, EyeOffIcon, TrashIcon, WarningIcon } from 'components/icons';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from 'components/redpanda-ui/components/alert-dialog';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { DataTableColumnHeader, DataTablePagination } from 'components/redpanda-ui/components/data-table';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryStateWithCallback } from 'hooks/use-query-state-with-callback';
import { Loader2, Search, XCircle } from 'lucide-react';
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import React, { type FC, useEffect, useMemo, useState } from 'react';
import { useGetAllClusterStatusQuery } from 'react-query/api/cluster-status';
import { useGetClusterHealthQuery } from 'react-query/api/debug-bundle';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { toast } from 'sonner';

import { CreateTopicModal } from './CreateTopicModal/create-topic-modal';
import usePaginationParams from '../../../hooks/use-pagination-params';
import { api } from '../../../state/backend-api';
import { type Topic, TopicActions } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/ui-state';
import { editQuery } from '../../../utils/query-helper';
import { Code, DefaultSkeleton, QuickTable } from '../../../utils/tsx-utils';
import { renderLogDirSummary } from '../../misc/common';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { Statistic } from '../../misc/statistic';

// Regex for quick search filtering
const QUICK_SEARCH_REGEX_CACHE = new Map<string, RegExp>();

const TopicList: FC = () => {
  useEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Topics', linkTo: '' }];
  }, []);

  const [localSearchValue, setLocalSearchValue] = useQueryState('q', parseAsString.withDefault(''));

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

  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useLegacyListTopicsQuery();
  useGetAllClusterStatusQuery();
  useGetClusterHealthQuery();
  const [topicToDelete, setTopicToDelete] = useState<Topic | null>(null);
  const [isCreateTopicModalOpen, setIsCreateTopicModalOpen] = useState(false);

  const topics = useMemo(() => {
    let filteredTopics = data.topics ?? [];
    if (!showInternalTopics) {
      filteredTopics = filteredTopics.filter((x) => !(x.isInternal || x.topicName.startsWith('_')));
    }

    const searchQuery = localSearchValue;
    if (searchQuery) {
      try {
        let quickSearchRegExp = QUICK_SEARCH_REGEX_CACHE.get(searchQuery);
        if (!quickSearchRegExp) {
          quickSearchRegExp = new RegExp(searchQuery, 'i');
          QUICK_SEARCH_REGEX_CACHE.set(searchQuery, quickSearchRegExp);
        }
        filteredTopics = filteredTopics.filter((topic) => Boolean(topic.topicName.match(quickSearchRegExp)));
      } catch (_e) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.warn('Invalid expression');
        const searchLower = searchQuery.toLowerCase();
        filteredTopics = filteredTopics.filter((topic) => topic.topicName.toLowerCase().includes(searchLower));
      }
    }

    return filteredTopics;
  }, [data.topics, showInternalTopics, localSearchValue]);

  const statistics = useMemo(() => {
    const partitionCount = topics.sum((x) => x.partitionCount);
    const replicaCount = topics.sum((x) => x.partitionCount * x.replicationFactor);

    return {
      partitionCount,
      replicaCount,
      topicCount: topics.length,
    };
  }, [topics]);

  if (isLoading) {
    return DefaultSkeleton;
  }

  if (isError) {
    return <div>Error</div>;
  }

  return (
    <PageContent>
      <Section>
        <div className="flex gap-4">
          <Statistic title="Total topics" value={statistics.topicCount} />
          <Statistic title="Total partitions" value={statistics.partitionCount} />
          <Statistic title="Total replicas" value={statistics.replicaCount} />
        </div>
      </Section>

      <div className="mt-2 mb-4">
        <Button
          className="min-w-[160px]"
          data-testid="create-topic-button"
          onClick={() => setIsCreateTopicModalOpen(true)}
        >
          Create topic
        </Button>
      </div>
      <Section>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-[350px] pl-8"
                onChange={(e) => setLocalSearchValue(e.target.value)}
                placeholder="Enter search term/regex"
                value={localSearchValue}
              />
            </div>
            <AnimatePresence>
              {Boolean(localSearchValue) && (
                <motion.div
                  animate={{ opacity: 1 }}
                  className="flex items-center"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <span className="ml-4 whitespace-nowrap text-sm">
                    <strong>{topics.length}</strong> {topics.length === 1 ? 'result' : 'results'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={showInternalTopics ?? false}
              data-testid="show-internal-topics-checkbox"
              id="show-internal-topics"
              onCheckedChange={(checked) => {
                setShowInternalTopics(Boolean(checked));
              }}
            />
            <Label htmlFor="show-internal-topics">Show internal topics</Label>
          </div>

          <CreateTopicModal isOpen={isCreateTopicModalOpen} onClose={() => setIsCreateTopicModalOpen(false)} />
        </div>
        <div className="my-4">
          <TopicsTable
            onDelete={(record) => {
              setTopicToDelete(record);
            }}
            topics={topics}
          />
        </div>
      </Section>

      <ConfirmDeletionModal
        onCancel={() => setTopicToDelete(null)}
        onFinish={async () => {
          setTopicToDelete(null);
          await queryClient.invalidateQueries();
        }}
        topicToDelete={topicToDelete}
      />
    </PageContent>
  );
};

const staticTopicsTableColumns: ColumnDef<Topic>[] = [
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Partitions" />,
    accessorKey: 'partitionCount',
    enableResizing: true,
    cell: ({ row: { original: topic } }) => topic.partitionCount,
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Replicas" />,
    accessorKey: 'replicationFactor',
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="CleanupPolicy" />,
    accessorKey: 'cleanupPolicy',
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Size" />,
    accessorKey: 'logDirSummary.totalSizeBytes',
    cell: ({ row: { original: topic } }) => renderLogDirSummary(topic.logDirSummary),
  },
  {
    id: 'action',
    header: '',
    cell: ({ row: { original: record }, table }) => {
      const { onDelete } = table.options.meta as { onDelete: (record: Topic) => void };
      return (
        <div className="flex gap-1">
          <DeleteDisabledTooltip topic={record}>
            <button
              data-testid={`delete-topic-button-${record.topicName}`}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(record);
              }}
              type="button"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </DeleteDisabledTooltip>
        </div>
      );
    },
  },
];

const TopicsTable: FC<{ topics: Topic[]; onDelete: (record: Topic) => void }> = ({ topics, onDelete }) => {
  const { data: clusterHealth } = useGetClusterHealthQuery();
  const paginationParams = usePaginationParams(topics.length, uiSettings.topicList.pageSize);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: paginationParams.pageIndex,
    pageSize: paginationParams.pageSize,
  });

  const columns = useMemo<ColumnDef<Topic>[]>(
    () => [
      {
        header: 'Name',
        accessorKey: 'topicName',
        cell: ({ row: { original: topic } }) => {
          const leaderLessPartitions = clusterHealth?.leaderlessPartitions?.find(
            ({ topicName }) => topicName === topic.topicName
          )?.partitionIds;
          const underReplicatedPartitions = clusterHealth?.underReplicatedPartitions?.find(
            ({ topicName }) => topicName === topic.topicName
          )?.partitionIds;

          return (
            <div className="flex items-center gap-2 whitespace-pre-wrap break-words">
              <Link
                data-testid={`topic-link-${topic.topicName}`}
                params={{ topicName: encodeURIComponent(topic.topicName) }}
                to="/topics/$topicName"
              >
                <TopicName topic={topic} />
              </Link>
              {!!leaderLessPartitions && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <ErrorIcon className="text-destructive" size={18} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {`This topic has ${leaderLessPartitions.length} ${leaderLessPartitions.length === 1 ? 'a leaderless partition' : 'leaderless partitions'}`}
                  </TooltipContent>
                </Tooltip>
              )}
              {!!underReplicatedPartitions && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <WarningIcon className="text-warning" size={18} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {`This topic has ${underReplicatedPartitions.length} ${underReplicatedPartitions.length === 1 ? 'an under-replicated partition' : 'under-replicated partitions'}`}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        },
        size: Number.POSITIVE_INFINITY,
      },
      ...staticTopicsTableColumns,
    ],
    [clusterHealth]
  );

  const table = useReactTable({
    data: topics,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const newPagination = typeof updater === 'function' ? updater(pagination) : updater;
      setPagination(newPagination);
      Object.assign(uiSettings.topicList, { pageSize: newPagination.pageSize });
      editQuery((query) => {
        query.page = String(newPagination.pageIndex);
        query.pageSize = String(newPagination.pageSize);
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    meta: { onDelete },
  });

  return (
    <TooltipProvider>
      <div data-testid="topics-table">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={columns.length}>
                  No topics found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataTablePagination table={table} />
      </div>
    </TooltipProvider>
  );
};

const iconAllowed = (
  <span style={{ color: 'green' }}>
    <CheckIcon size={16} />
  </span>
);
const iconForbidden = (
  <span style={{ color: '#ca000a' }}>
    <BanIcon size={15} />
  </span>
);
const iconClosedEye = (
  <span style={{ color: '#0008', paddingLeft: '4px', transform: 'translateY(-1px)', display: 'inline-block' }}>
    <EyeOffIcon size={14} />
  </span>
);

const TopicName = ({ topic }: { topic: Topic }) => {
  const actions = topic.allowedActions;

  if (!actions || actions[0] === 'all') {
    return topic.topicName; // happens in non-business version
  }

  let missing = 0;
  for (const a of TopicActions) {
    if (!actions.includes(a)) {
      missing += 1;
    }
  }

  if (missing === 0) {
    return topic.topicName; // everything is allowed
  }

  // There's at least one action the user can't do
  // Show a table of what they can't do
  const popoverContent = (
    <div>
      <div style={{ marginBottom: '1em' }}>
        You're missing permissions to view
        <br />
        one more aspects of this topic.
      </div>
      {QuickTable(
        TopicActions.map((a) => ({
          key: a,
          value: actions.includes(a) ? iconAllowed : iconForbidden,
        })),
        {
          gapWidth: '6px',
          gapHeight: '2px',
          keyAlign: 'right',
          keyStyle: { fontSize: '86%', fontWeight: 700, textTransform: 'capitalize' },
          tableStyle: { margin: 'auto' },
        }
      )}
    </div>
  );

  return (
    <div className="break-words">
      <Popover>
        <PopoverTrigger asChild>
          <span>
            {topic.topicName}
            {iconClosedEye}
          </span>
        </PopoverTrigger>
        <PopoverContent side="right">{popoverContent}</PopoverContent>
      </Popover>
    </div>
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
  const [error, setError] = useState<string | Error | null>(null);

  const cleanup = () => {
    setDeletionPending(false);
    setError(null);
  };

  const finish = () => {
    onFinish();
    cleanup();

    toast.success('Topic Deleted', {
      description: (
        <span>
          Topic <Code>{topicToDelete?.topicName}</Code> deleted successfully
        </span>
      ),
    });
  };

  const cancel = () => {
    onCancel();
    cleanup();
  };

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          cancel();
        }
      }}
      open={topicToDelete !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Topic</AlertDialogTitle>
        </AlertDialogHeader>

        <div>
          {Boolean(error) && (
            <Alert className="mb-2" variant="destructive">
              <XCircle />
              <AlertDescription>
                {`An error occurred: ${typeof error === 'string' ? error : (error?.message ?? 'Unknown error')}`}
              </AlertDescription>
            </Alert>
          )}
          {Boolean(topicToDelete?.isInternal) && (
            <Alert className="mb-2" variant="destructive">
              <XCircle />
              <AlertDescription>
                This is an internal topic, deleting it might have unintended side-effects!
              </AlertDescription>
            </Alert>
          )}
          <Text>
            Are you sure you want to delete topic <Code>{topicToDelete?.topicName}</Code>?<br />
            This action cannot be undone.
          </Text>
        </div>

        <AlertDialogFooter>
          <Button onClick={cancel} variant="ghost">
            Cancel
          </Button>
          <Button
            className="ml-3"
            data-testid="delete-topic-confirm-button"
            disabled={deletionPending}
            onClick={() => {
              if (topicToDelete?.topicName) {
                setDeletionPending(true);
                api
                  .deleteTopic(topicToDelete?.topicName)
                  .then(finish)
                  .catch((err) => {
                    toast.error('Failed to delete topic', {
                      description: String(err.message),
                    });
                  })
                  .finally(() => {
                    setDeletionPending(false);
                  });
              }
            }}
          >
            {deletionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteDisabledTooltip(props: { topic: Topic; children: JSX.Element }): JSX.Element {
  const deleteButton = props.children;

  const wrap = (button: JSX.Element, message: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        {React.cloneElement(button, {
          disabled: true,
          className: `${button.props.className ?? ''} disabled`,
          onClick: undefined,
        })}
      </TooltipTrigger>
      <TooltipContent side="left">{message}</TooltipContent>
    </Tooltip>
  );

  return (
    <>
      {hasDeletePrivilege()
        ? deleteButton
        : wrap(deleteButton, "You don't have 'deleteTopic' permission for this topic.")}
    </>
  );
}

function hasDeletePrivilege() {
  // TODO - we will provide ACL for this
  return true;
}

export default TopicList;
