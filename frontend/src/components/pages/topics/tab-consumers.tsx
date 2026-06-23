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

import { Link } from '@tanstack/react-router';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { type FC, useEffect } from 'react';

import { useUrlTableState } from '../../../hooks/use-url-table-state';
import { api, useApiStoreHook } from '../../../state/backend-api';
import type { Topic, TopicConsumer } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { DataTableColumnHeader, DataTablePagination } from '../../redpanda-ui/components/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';

type TopicConsumersProps = { topic: Topic };

export const TopicConsumers: FC<TopicConsumersProps> = ({ topic }) => {
  useEffect(() => {
    api.refreshTopicConsumers(topic.topicName);
  }, [topic.topicName]);

  const rawConsumers = useApiStoreHook((s) => s.topicConsumers.get(topic.topicName));
  const isLoading = rawConsumers === undefined;
  const consumers = rawConsumers ?? [];

  const { sorting, pagination, onSortingChange, onPaginationChange } = useUrlTableState({
    keyPrefix: 'consumer',
    settings: uiSettings.topicConsumersList,
    rowCount: consumers.length,
    enabled: !isLoading,
  });

  const columns: ColumnDef<TopicConsumer>[] = [
    {
      accessorKey: 'groupId',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Group" />,
      cell: ({ row: { original } }) => (
        <Link
          className="text-inherit no-underline hover:no-underline"
          params={{ groupId: encodeURIComponent(original.groupId) }}
          search={{} as never}
          to="/groups/$groupId"
        >
          {original.groupId}
        </Link>
      ),
    },
    {
      accessorKey: 'summedLag',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lag" />,
    },
  ];

  const table = useReactTable({
    data: consumers,
    columns,
    state: { sorting, pagination },
    onSortingChange,
    onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  if (isLoading) {
    return DefaultSkeleton;
  }

  return (
    <>
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
