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
  type Updater,
  useReactTable,
} from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';

import '../../../utils/array-extensions';

import { useQueryStateWithCallback } from '../../../hooks/use-query-state-with-callback';
import { useApiStoreHook } from '../../../state/backend-api';
import type { Partition, Topic } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton, numberToThousandsString } from '../../../utils/tsx-utils';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import { BrokerList } from '../../misc/broker-list';
import { Alert, AlertDescription } from '../../redpanda-ui/components/alert';
import { Badge } from '../../redpanda-ui/components/badge';
import { DataTableColumnHeader, DataTablePagination } from '../../redpanda-ui/components/data-table';
import { Popover, PopoverContent, PopoverTrigger } from '../../redpanda-ui/components/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';

type TopicPartitionsProps = { topic: Topic };

export const TopicPartitions: FC<TopicPartitionsProps> = ({ topic }) => {
  const partitions = useApiStoreHook((s) => s.topicPartitions.get(topic.topicName));
  const clusterHealth = useApiStoreHook((s) => s.clusterHealth);

  const [pageIndex, setPageIndex] = useQueryState('partitionPage', parseAsInteger.withDefault(0));

  const [pageSize, setPageSize] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        uiSettings.topicPartitionsList.pageSize = val;
      },
      getDefaultValue: () => uiSettings.topicPartitionsList.pageSize,
    },
    'partitionPageSize',
    parseAsInteger.withDefault(DEFAULT_TABLE_PAGE_SIZE)
  );

  const [sortId, setSortId] = useQueryStateWithCallback<string>(
    {
      onUpdate: (val) => {
        uiSettings.topicPartitionsList.sortId = val;
      },
      getDefaultValue: () => uiSettings.topicPartitionsList.sortId,
    },
    'partitionSortId',
    parseAsString.withDefault('')
  );

  const [sortDesc, setSortDesc] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        uiSettings.topicPartitionsList.sortDesc = val;
      },
      getDefaultValue: () => uiSettings.topicPartitionsList.sortDesc,
    },
    'partitionSortDesc',
    parseAsBoolean.withDefault(false)
  );

  if (partitions === undefined) {
    return DefaultSkeleton;
  }
  if (partitions === null) {
    return <div />;
  }

  const leaderlessPartitions = (clusterHealth?.leaderlessPartitions ?? []).find(
    ({ topicName }) => topicName === topic.topicName
  )?.partitionIds;

  const underReplicatedPartitions = (clusterHealth?.underReplicatedPartitions ?? []).find(
    ({ topicName }) => topicName === topic.topicName
  )?.partitionIds;

  const sorting: SortingState = sortId ? [{ id: sortId, desc: sortDesc }] : [];
  const pagination: PaginationState = { pageIndex, pageSize };

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

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const next = typeof updater === 'function' ? updater(pagination) : updater;
    void setPageIndex(next.pageIndex);
    setPageSize(next.pageSize);
  };

  const columns: ColumnDef<Partition>[] = [
    {
      accessorKey: 'id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Partition ID" />,
      cell: ({ row: { original: partition } }) => (
        <div className="flex items-center gap-2">
          <span>{partition.id}</span>
          {partition.hasErrors && <PartitionError partition={partition} />}
          {leaderlessPartitions?.includes(partition.id) && <Badge variant="destructive-inverted">Leaderless</Badge>}
          {underReplicatedPartitions?.includes(partition.id) && (
            <Badge variant="warning-inverted">Under-replicated</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'waterMarkLow',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Low Water Mark" />,
      cell: ({ row: { original: partition } }) => numberToThousandsString(partition.waterMarkLow),
    },
    {
      accessorKey: 'waterMarkHigh',
      header: ({ column }) => <DataTableColumnHeader column={column} title="High Water Mark" />,
      cell: ({ row: { original: partition } }) => numberToThousandsString(partition.waterMarkHigh),
    },
    {
      id: 'messages',
      accessorFn: (partition) => (partition.hasErrors ? null : partition.waterMarkHigh - partition.waterMarkLow),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Messages" />,
      cell: ({ row: { original: partition } }) =>
        partition.hasErrors ? null : numberToThousandsString(partition.waterMarkHigh - partition.waterMarkLow),
    },
    {
      id: 'brokers',
      header: 'Brokers',
      enableSorting: false,
      cell: ({ row: { original: partition } }) => <BrokerList partition={partition} />,
    },
  ];

  const table = useReactTable({
    data: partitions,
    columns,
    state: { sorting, pagination },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  return (
    <>
      {topic.cleanupPolicy.toLowerCase() === 'compact' && (
        <Alert className="mb-4" variant="warning">
          <AlertDescription>Topic cleanupPolicy is &apos;compact&apos;. Message Count is an estimate!</AlertDescription>
        </Alert>
      )}
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
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <DataTablePagination table={table} />
    </>
  );
};

const PartitionError: FC<{ partition: Partition }> = ({ partition }) => {
  if (!(partition.partitionError || partition.waterMarksError)) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex" type="button">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-[500px]" side="right">
        <p className="mb-2 font-medium">Partition Error</p>
        <div className="flex flex-col gap-2 whitespace-pre-wrap text-sm">
          {Boolean(partition.partitionError) && <p>{partition.partitionError}</p>}
          {Boolean(partition.waterMarksError) && <p>{partition.waterMarksError}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
};
