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

import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Input } from 'components/redpanda-ui/components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { Info, Loader2, RefreshCw, X } from 'lucide-react';
import type { ShadowTopic } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { ShadowTopicStatusBadge } from './shadow-topic-status-badge';

type ShadowTopicsTableProps = {
  topics: ShadowTopic[] | undefined;
  onFailoverTopic: (topicName: string) => void;
  onRefresh?: () => void;
  getNextTopicPage?: () => Promise<void>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isFetching?: boolean;
  topicNameFilter?: string;
  onTopicNameFilterChange?: (value: string) => void;
};

const emptyTopics: ShadowTopic[] = [];

// Reusable loading row component
const LoadingRow = ({ message, columnsLength }: { message: string; columnsLength: number }) => (
  <TableRow>
    <TableCell className="h-16 text-center" colSpan={columnsLength}>
      <div className="flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <Text className="text-muted-foreground">{message}</Text>
      </div>
    </TableCell>
  </TableRow>
);

// Extracted component for table body rows
const VirtualizedRows = ({
  virtualRows,
  rows,
  isFetchingNextPage,
  isFetching,
  columnsLength,
}: {
  virtualRows: ReturnType<ReturnType<typeof useVirtualizer>['getVirtualItems']>;
  rows: ReturnType<ReturnType<typeof useReactTable>['getRowModel']>['rows'];
  isFetchingNextPage?: boolean;
  isFetching?: boolean;
  columnsLength: number;
}) => {
  if (virtualRows.length > 0) {
    return (
      <>
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          );
        })}
        {isFetchingNextPage && <LoadingRow columnsLength={columnsLength} message="Loading more topics..." />}
      </>
    );
  }

  if (isFetching) {
    return <LoadingRow columnsLength={columnsLength} message="Loading topics..." />;
  }

  return (
    <TableRow>
      <TableCell className="h-24 text-center" colSpan={columnsLength}>
        No topics found.
      </TableCell>
    </TableRow>
  );
};

export const ShadowTopicsTable: React.FC<ShadowTopicsTableProps> = ({
  topics,
  onFailoverTopic,
  onRefresh,
  getNextTopicPage,
  hasNextPage,
  isFetchingNextPage,
  isFetching,
  topicNameFilter,
  onTopicNameFilterChange,
}) => {
  const columnHelper = createColumnHelper<ShadowTopic>();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const columns = useMemo(
    () => [
      columnHelper.accessor('topicName', {
        header: 'Name',
        size: 300,
        cell: (info) => (
          <Text className="font-medium" variant="default">
            {info.getValue()}
          </Text>
        ),
      }),
      columnHelper.accessor('totalLag', {
        header: () => (
          <div className="flex items-center gap-2">
            Max offset lag
            <Tooltip>
              <TooltipTrigger asChild data-testid="max-offset-lag-info-icon">
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Maximum offset difference between source and replica topic partitions</p>
              </TooltipContent>
            </Tooltip>
          </div>
        ),
        size: 150,
        cell: (info) => <Text className="text-muted-foreground">{info.getValue().toString()}</Text>,
      }),
      columnHelper.accessor('state', {
        header: 'Replication state',
        size: 200,
        cell: (info) => <ShadowTopicStatusBadge state={info.getValue()} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        size: 250,
        cell: ({ row }) => {
          const topic = row.original;
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                onClick={() => navigate(`/topics/${topic.topicName}?pageSize=10`)}
                size="sm"
                type="button"
                variant="outline"
              >
                View topic
              </Button>
              {topic.state === ShadowTopicState.ACTIVE && (
                <Button onClick={() => onFailoverTopic(topic.topicName)} size="sm" type="button" variant="outline">
                  Failover
                </Button>
              )}
            </div>
          );
        },
      }),
    ],
    [columnHelper, navigate, onFailoverTopic]
  );

  const table = useReactTable<ShadowTopic>({
    data: topics ?? emptyTopics,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows } = table.getRowModel();

  // Initialize virtualizer
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - (virtualRows.at(-1)?.end ?? 0) : 0;

  // Auto-fetch next page when scrolling near bottom
  useEffect(() => {
    const [lastItem] = [...virtualRows].reverse();

    if (!lastItem) {
      return;
    }

    // When last visible item is near the end, fetch more
    if (lastItem.index >= rows.length - 1 && hasNextPage && !isFetchingNextPage && getNextTopicPage) {
      void getNextTopicPage();
    }
  }, [hasNextPage, getNextTopicPage, isFetchingNextPage, rows.length, virtualRows]);

  return (
    <TooltipProvider>
      <Card size="full">
        <CardHeader>
          <CardTitle>Replicated topics</CardTitle>
          <CardAction>
            <div className="mb-4 flex items-center gap-2">
              {isFetching && (
                <Button size="icon" variant="ghost">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </Button>
              )}
              <div className="relative max-w-xs flex-1">
                <Input
                  data-testid="filter-topics-input"
                  onChange={(e) => onTopicNameFilterChange?.(e.target.value)}
                  placeholder="Filter topics by name..."
                  type="text"
                  value={topicNameFilter || ''}
                />
              </div>
              {topicNameFilter && (
                <Button onClick={() => onTopicNameFilterChange?.('')} size="sm" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button
                data-testid="refresh-topics-button"
                disabled={isFetching}
                onClick={onRefresh}
                size="icon"
                variant="ghost"
              >
                <RefreshCw className="h-5 w-5" />
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {/*
            Two-table structure for virtualization with fixed header:
            1. First <Table> contains header - stays fixed, always visible
            2. Second <Table> in scrollable div contains body - virtualized rows

            Why not one table?
            - Sticky positioning on <thead> doesn't work reliably when scroll container wraps entire table
            - We need the header outside the scroll container for it to remain fixed
            - Separate tables allow independent scroll behavior while keeping columns aligned
          */}
          <div className="relative">
            <Table className="" style={{ tableLayout: 'fixed', width: '100%' }} variant={'simple'}>
              {/*
                colgroup enforces fixed column widths to prevent browser from recalculating
                when new rows are added via pagination/infinite scroll. Both header and body
                tables must have identical colgroup definitions to keep columns aligned.
              */}
              <colgroup>
                {table.getAllColumns().map((column) => (
                  <col key={column.id} style={{ width: `${column.getSize()}px` }} />
                ))}
              </colgroup>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} style={{ borderBottom: 'none', borderRadius: 0 }}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
            </Table>
            <div className="max-h-[600px] overflow-y-auto" ref={tableContainerRef}>
              <Table className="border-t-0" style={{ tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {table.getAllColumns().map((column) => (
                    <col key={column.id} style={{ width: `${column.getSize()}px` }} />
                  ))}
                </colgroup>
                <TableBody>
                  {paddingTop > 0 && (
                    <TableRow>
                      <TableCell colSpan={columns.length} style={{ height: `${paddingTop}px` }} />
                    </TableRow>
                  )}
                  <VirtualizedRows
                    columnsLength={columns.length}
                    isFetching={isFetching}
                    isFetchingNextPage={isFetchingNextPage}
                    rows={rows}
                    virtualRows={virtualRows}
                  />
                  {paddingBottom > 0 && (
                    <TableRow>
                      <TableCell colSpan={columns.length} style={{ height: `${paddingBottom}px` }} />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
