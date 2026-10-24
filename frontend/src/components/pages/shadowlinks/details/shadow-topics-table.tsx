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

import { useNavigate } from '@tanstack/react-router';
import { useVirtualizer } from '@tanstack/react-virtual';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import {
  createDataTableColumnHelper,
  type DataTableInstance,
  useDataTable,
} from 'components/redpanda-ui/components/data-table';
import { Input } from 'components/redpanda-ui/components/input';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Info, RefreshCw, X } from 'lucide-react';
import type { ShadowTopic } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
        <Spinner />
        <div className="text-body text-muted-foreground">{message}</div>
      </div>
    </TableCell>
  </TableRow>
);

// Replaces further rows when the next page fails; automatic loading stays off until the user retries.
const NextPageErrorRow = ({
  columnsLength,
  error,
  onRetry,
}: {
  columnsLength: number;
  error: string;
  onRetry: () => void;
}) => (
  <TableRow>
    <TableCell className="h-16 text-center" colSpan={columnsLength}>
      <div className="flex items-center justify-center gap-2">
        <span className="text-body text-destructive" role="alert">
          Failed to load more topics: {error}
        </span>
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          Retry
        </Button>
      </div>
    </TableCell>
  </TableRow>
);

// Extracted component for table body rows
const VirtualizedRows = ({
  table,
  virtualRows,
  rows,
  isFetchingNextPage,
  isFetching,
  columnsLength,
  nextPageError,
  onRetryNextPage,
}: {
  table: DataTableInstance<ShadowTopic>;
  virtualRows: ReturnType<ReturnType<typeof useVirtualizer>['getVirtualItems']>;
  rows: ReturnType<ReturnType<typeof useDataTable<ShadowTopic>>['getRowModel']>['rows'];
  isFetchingNextPage?: boolean;
  isFetching?: boolean;
  columnsLength: number;
  nextPageError: string | null;
  onRetryNextPage: () => void;
}) => {
  if (virtualRows.length > 0) {
    return (
      <>
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{<table.FlexRender cell={cell} />}</TableCell>
              ))}
            </TableRow>
          );
        })}
        {Boolean(isFetchingNextPage) && <LoadingRow columnsLength={columnsLength} message="Loading more topics..." />}
        {nextPageError !== null && (
          <NextPageErrorRow columnsLength={columnsLength} error={nextPageError} onRetry={onRetryNextPage} />
        )}
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

type VirtualTopicRowsOptions = {
  rowCount: number;
  scrollElementRef: React.RefObject<HTMLDivElement | null>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  getNextTopicPage?: () => Promise<void>;
};

/**
 * Virtualizes the topic rows and fetches the next page once the last row scrolls into view. A failed
 * page is kept as `nextPageError` and blocks further automatic fetches until it is cleared.
 */
const useVirtualTopicRows = ({
  rowCount,
  scrollElementRef,
  hasNextPage,
  isFetchingNextPage,
  getNextTopicPage,
}: VirtualTopicRowsOptions) => {
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 50,
    overscan: 10,
  });

  // Without this, a failing page is requested again on every render that flips isFetchingNextPage.
  const [nextPageError, setNextPageError] = useState<string | null>(null);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Auto-fetch next page when scrolling near bottom
  useEffect(() => {
    const [lastItem] = [...virtualRows].reverse();

    if (!lastItem) {
      return;
    }

    // When last visible item is near the end, fetch more
    const canFetch = hasNextPage && !isFetchingNextPage && nextPageError === null;
    if (lastItem.index >= rowCount - 1 && canFetch && getNextTopicPage) {
      getNextTopicPage().catch((error: unknown) => {
        setNextPageError(error instanceof Error ? error.message : String(error));
      });
    }
  }, [hasNextPage, getNextTopicPage, isFetchingNextPage, nextPageError, rowCount, virtualRows]);

  return {
    virtualRows,
    paddingTop: virtualRows.length > 0 ? virtualRows[0].start : 0,
    paddingBottom: virtualRows.length > 0 ? totalSize - (virtualRows.at(-1)?.end ?? 0) : 0,
    nextPageError,
    // Clearing the error re-arms the effect above, which fetches the page again.
    clearNextPageError: () => setNextPageError(null),
  };
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
  const columnHelper = createDataTableColumnHelper<ShadowTopic>();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('topicName', {
          header: 'Name',
          size: 300,
          cell: (info) => <div className="text-body font-medium">{info.getValue()}</div>,
        }),
        columnHelper.accessor('totalLag', {
          header: () => (
            <div className="flex items-center gap-2">
              Max offset lag
              <Tooltip>
                <TooltipTrigger
                  data-testid="max-offset-lag-info-icon"
                  render={<TonedIcon className="h-4 w-4" icon={Info} tone="muted" />}
                />
                <TooltipContent>
                  <p>Maximum offset difference between source and replica topic partitions</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ),
          size: 150,
          cell: (info) => <div className="text-body text-muted-foreground">{info.getValue().toString()}</div>,
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
                  onClick={() => navigate({ to: `/topics/${topic.topicName}?pageSize=10` })}
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
      ]),
    [columnHelper, navigate, onFailoverTopic]
  );

  const table = useDataTable<ShadowTopic>({
    data: topics ?? emptyTopics,
    columns,
  });

  const { rows } = table.getRowModel();
  const { virtualRows, paddingTop, paddingBottom, nextPageError, clearNextPageError } = useVirtualTopicRows({
    rowCount: rows.length,
    scrollElementRef: tableContainerRef,
    hasNextPage,
    isFetchingNextPage,
    getNextTopicPage,
  });
  // A failed page belongs to the previous filter's query, so a new filter starts without it.
  const changeTopicNameFilter = (value: string) => {
    clearNextPageError();
    onTopicNameFilterChange?.(value);
  };

  return (
    <TooltipProvider>
      <Card size="full">
        <CardHeader>
          <CardTitle>Replicated topics</CardTitle>
          <CardAction>
            <div className="mb-4 flex items-center gap-2">
              {Boolean(isFetching) && (
                <span className="flex size-9 items-center justify-center">
                  <Spinner className="size-5" />
                </span>
              )}
              <div className="relative max-w-xs flex-1">
                <Input
                  data-testid="filter-topics-input"
                  onChange={(e) => changeTopicNameFilter(e.target.value)}
                  placeholder="Filter topics by name..."
                  type="text"
                  value={topicNameFilter || ''}
                />
              </div>
              {Boolean(topicNameFilter) && (
                <Button aria-label="Clear filter" onClick={() => changeTopicNameFilter('')} size="sm" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button
                aria-label="Refresh topics"
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
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
            </Table>
            <div className="max-h-[600px] overflow-y-auto" ref={tableContainerRef}>
              <Table style={{ tableLayout: 'fixed', width: '100%' }}>
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
                    nextPageError={nextPageError}
                    onRetryNextPage={clearNextPageError}
                    rows={rows}
                    table={table}
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
