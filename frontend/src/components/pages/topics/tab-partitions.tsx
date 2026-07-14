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
  useReactTable,
} from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import type { FC } from 'react';

import '../../../utils/array-extensions';

import { useUrlTableState } from '../../../hooks/use-url-table-state';
import { useApiStoreHook } from '../../../state/backend-api';
import type { Partition, Topic } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton, numberToThousandsString } from '../../../utils/tsx-utils';
import { BrokerList } from '../../misc/broker-list';
import { Alert, AlertDescription } from '../../redpanda-ui/components/alert';
import { Badge } from '../../redpanda-ui/components/badge';
import { Button } from '../../redpanda-ui/components/button';
import { DataTableColumnHeader, DataTablePagination } from '../../redpanda-ui/components/data-table';
import { Popover, PopoverContent, PopoverTrigger } from '../../redpanda-ui/components/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';

type TopicPartitionsProps = { topic: Topic };

export const TopicPartitions: FC<TopicPartitionsProps> = ({ topic }) => {
  const partitions = useApiStoreHook((s) => s.topicPartitions.get(topic.topicName));
  const clusterHealth = useApiStoreHook((s) => s.clusterHealth);

  // Kept above the early returns so the hook order stays stable; clamping no-ops until partitions load.
  const { sorting, pagination, onSortingChange, onPaginationChange } = useUrlTableState({
    keyPrefix: 'partition',
    settings: uiSettings.topicPartitionsList,
    rowCount: Array.isArray(partitions) ? partitions.length : 0,
    enabled: Array.isArray(partitions),
  });

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
    onSortingChange,
    onPaginationChange,
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
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell className="text-center" colSpan={columns.length}>
                No data found
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          )}
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
      <PopoverTrigger
        render={
          <Button aria-label="Show partition error details" size="icon-sm" type="button" variant="ghost">
            <AlertTriangle className="text-warning" />
          </Button>
        }
      />
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
