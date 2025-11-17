/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

'use client';

import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { RefreshCw } from 'lucide-react';
import type { ShadowLinkTaskStatus } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { useMemo } from 'react';

import { TaskStatusBadge } from './task-status-badge';

type TasksTableProps = {
  tasks: ShadowLinkTaskStatus[];
  onRefresh?: () => void;
};

export const TasksTable = ({ tasks, onRefresh }: TasksTableProps) => {
  const columnHelper = createColumnHelper<ShadowLinkTaskStatus>();

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Task name',
        size: 250,
        cell: (info) => (
          <Text className="font-medium" variant="default">
            {info.getValue()}
          </Text>
        ),
      }),
      columnHelper.accessor('state', {
        header: 'State',
        size: 150,
        cell: (info) => <TaskStatusBadge state={info.getValue()} taskId={info.row.original.name} />,
      }),
      columnHelper.accessor('brokerId', {
        header: 'Broker ID',
        size: 100,
        cell: (info) => <Text>{info.getValue()}</Text>,
      }),
      columnHelper.accessor('shardId', {
        header: 'Shard ID',
        size: 100,
        cell: (info) => <Text>{info.getValue()}</Text>,
      }),
      columnHelper.accessor('reason', {
        header: 'Reason',
        size: 300,
        cell: (info) => <Text className="text-muted-foreground">{info.getValue()}</Text>,
      }),
    ],
    [columnHelper]
  );

  const table = useReactTable<ShadowLinkTaskStatus>({
    data: tasks ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Card size="full" testId="tasks-table-card">
      <CardHeader>
        <CardTitle>Tasks</CardTitle>
        {onRefresh && (
          <CardAction>
            <Button data-testid="refresh-tasks-button" onClick={onRefresh} size="icon" type="button" variant="ghost">
              <RefreshCw className="h-5 w-5" />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {tasks?.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Text className="text-muted-foreground">No tasks found</Text>
          </div>
        ) : (
          <Table testId="tasks-table">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} style={{ width: header.getSize() }}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow data-testid={`task-row-${row.original.name}`} key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
