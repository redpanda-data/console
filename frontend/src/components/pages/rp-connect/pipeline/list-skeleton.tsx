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

import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { cn } from 'components/redpanda-ui/lib/utils';
import type { ReactElement } from 'react';

const SKELETON_COLUMNS: { head: string; cell: ReactElement }[] = [
  {
    head: 'w-24',
    cell: (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-60" />
      </div>
    ),
  },
  { head: 'w-16', cell: <Skeleton className="h-6 w-20" /> },
  {
    head: 'w-20',
    cell: (
      <div className="flex gap-1">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    ),
  },
  { head: 'w-16', cell: <Skeleton className="h-6 w-20" /> },
  { head: 'w-16', cell: <Skeleton className="h-6 w-16" /> },
  { head: 'w-8', cell: <Skeleton className="h-8 w-8" /> },
];

const SKELETON_ROW_COUNT = 5;

export const PipelineListSkeleton = () => (
  <div className="flex flex-col gap-4">
    <div className="flex items-center justify-between gap-4">
      <Skeleton className="h-8 w-[200px]" />
      <Skeleton className="h-8 w-20" />
    </div>
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-8 w-20" />
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          {SKELETON_COLUMNS.map((column, columnIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
            <TableHead key={columnIndex}>
              <Skeleton className={cn('h-4', column.head)} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
          <TableRow key={rowIndex}>
            {SKELETON_COLUMNS.map((column, columnIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeletons
              <TableCell key={columnIndex}>{column.cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
    {/* Stands in for the pagination footer: without it, the first real paint lifts the table. */}
    <div className="flex items-center justify-end gap-6 px-2">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
  </div>
);
