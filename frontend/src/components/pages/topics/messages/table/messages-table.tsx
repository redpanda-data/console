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

import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/react-table';
import { Button } from 'components/redpanda-ui/components/button';
import { type DataTableColumnDef, useDataTable } from 'components/redpanda-ui/components/data-table';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ArrowDownIcon, ArrowUpIcon, TriangleAlertIcon } from 'lucide-react';
import { Fragment, useMemo } from 'react';

import { KeyCell, OffsetCell, SizeCell, TimestampCell, ValueCell, type ValuePreviewConfig } from './message-cells';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { TimestampDisplayFormat } from '../../../../../state/ui';
import { COLUMN_LABELS } from '../constants';
import type { MessageColumnConfig, RowDensity } from '../types';
import { messageKey } from '../utils/message-key';
import { isSortableColumnId } from '../utils/message-order';

export type MessagesTableProps = {
  messages: TopicMessage[];
  columnConfig: MessageColumnConfig[];
  density: RowDensity;
  timestampFormat: TimestampDisplayFormat;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  /** Sorting is unavailable in continuous mode — server order must be preserved for paging. */
  sortingDisabled: boolean;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  isLoading: boolean;
  /** True while live tail is streaming with no rows yet. */
  isLiveWaiting: boolean;
  hasActiveFilter: boolean;
  selectedKey: string | null;
  onRowClick: (msg: TopicMessage) => void;
  /** Rows that arrived in the last few seconds; they get the flash animation. */
  newKeys: ReadonlySet<string>;
  /** Rendered before the first row that existed before live tail started. */
  liveSeparatorKey?: string | null;
  /** Preview-fields rendering for the value column (from view settings). */
  valuePreview?: ValuePreviewConfig;
  /** Set when the search stream failed outright (network/auth/timeout) — takes priority over
   * the empty/waiting states, which would otherwise make a failed request look like a topic
   * that genuinely has no matching messages. */
  error?: string | null;
  onRetry?: () => void;
};

const buildColumn = (
  config: MessageColumnConfig,
  density: RowDensity,
  timestampFormat: TimestampDisplayFormat,
  sortingDisabled: boolean,
  valuePreview?: ValuePreviewConfig
): DataTableColumnDef<TopicMessage> => {
  // enableSorting mirrors isSortableColumnId exactly — message-order.ts's visiblePageKeys reads
  // off the same predicate so keyboard nav walks the same order tanstack actually renders.
  const base: DataTableColumnDef<TopicMessage> = {
    id: config.id,
    header: COLUMN_LABELS[config.id],
    enableSorting: isSortableColumnId(config.id, sortingDisabled),
  };
  switch (config.id) {
    case 'offset':
      return { ...base, accessorKey: 'offset', cell: ({ row }) => <OffsetCell offset={row.original.offset} /> };
    case 'partitionID':
      return {
        ...base,
        accessorKey: 'partitionID',
        cell: ({ row }) => <span className="font-mono text-[13px] tabular-nums">{row.original.partitionID}</span>,
      };
    case 'timestamp':
      return {
        ...base,
        accessorKey: 'timestamp',
        cell: ({ row }) => <TimestampCell format={timestampFormat} timestamp={row.original.timestamp} />,
      };
    case 'key':
      return { ...base, accessorKey: 'keyJson', cell: ({ row }) => <KeyCell density={density} msg={row.original} /> };
    case 'value':
      return {
        ...base,
        accessorKey: 'valueJson',
        cell: ({ row }) => <ValueCell density={density} msg={row.original} preview={valuePreview} />,
      };
    case 'keySize':
      return { ...base, accessorKey: 'key.size', cell: ({ row }) => <SizeCell size={row.original.key.size} /> };
    case 'valueSize':
      return { ...base, accessorKey: 'value.size', cell: ({ row }) => <SizeCell size={row.original.value.size} /> };
    default:
      return base;
  }
};

const LoadingRows = ({ columnCount }: { columnCount: number }) => (
  <>
    {Array.from({ length: 5 }, (_, rowIdx) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
      <TableRow key={rowIdx}>
        {Array.from({ length: columnCount }, (_, colIdx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells
          <TableCell key={colIdx}>
            <Skeleton className="h-4 w-full max-w-48" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Empty className="py-14" data-testid="messages-error">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <TriangleAlertIcon />
      </EmptyMedia>
      <EmptyTitle>Couldn't load messages</EmptyTitle>
      <EmptyDescription>{message}</EmptyDescription>
    </EmptyHeader>
    {onRetry ? (
      <EmptyContent>
        <Button onClick={onRetry} size="sm" testId="messages-error-retry" variant="outline">
          Retry
        </Button>
      </EmptyContent>
    ) : null}
  </Empty>
);

const LiveWaitingState = () => (
  <Empty className="py-14" data-testid="messages-live-waiting">
    <EmptyHeader>
      <EmptyTitle>Waiting for messages…</EmptyTitle>
      <EmptyDescription>Streaming live from the topic. New records will appear here as they arrive.</EmptyDescription>
    </EmptyHeader>
    <div className="mt-2 flex w-full max-w-lg flex-col gap-2">
      <Skeleton className="h-3.5 w-full animate-pulse" />
      <Skeleton className="h-3.5 w-4/5 animate-pulse" />
      <Skeleton className="h-3.5 w-3/5 animate-pulse" />
    </div>
  </Empty>
);

const LiveSeparatorRow = ({ columnCount }: { columnCount: number }) => (
  <TableRow className="hover:bg-transparent" data-testid="messages-live-separator">
    <TableCell className="p-0" colSpan={columnCount}>
      <div className="flex items-center gap-2.5 border-green-200 border-y bg-green-100 px-4 py-1.5 dark:border-green-900 dark:bg-green-950">
        <span className="flex items-center gap-1.5 font-bold text-[11px] text-green-700 uppercase tracking-wider dark:text-green-400">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-green-600" />
          Live
        </span>
        <span className="text-green-700 text-xs dark:text-green-400">New messages appear above as they arrive</span>
      </div>
    </TableCell>
  </TableRow>
);

export const MessagesTable = ({
  messages,
  columnConfig,
  density,
  timestampFormat,
  sorting,
  onSortingChange,
  sortingDisabled,
  pagination,
  onPaginationChange,
  isLoading,
  isLiveWaiting,
  hasActiveFilter,
  selectedKey,
  onRowClick,
  newKeys,
  liveSeparatorKey,
  valuePreview,
  error,
  onRetry,
}: MessagesTableProps) => {
  // All configured columns are registered (so sorting can reference hidden ones,
  // e.g. the offset tiebreaker); visibility is controlled through table state.
  const columns = useMemo(
    () => columnConfig.map((config) => buildColumn(config, density, timestampFormat, sortingDisabled, valuePreview)),
    [columnConfig, density, timestampFormat, sortingDisabled, valuePreview]
  );

  const columnVisibility = useMemo(
    () => Object.fromEntries(columnConfig.map((c) => [c.id, c.visible])),
    [columnConfig]
  );

  const table = useDataTable({
    data: messages,
    columns,
    state: { sorting, pagination, columnVisibility },
    onSortingChange,
    onPaginationChange,
    // Pagination is controlled through URL state; auto-reset would fire
    // onPaginationChange on every data change and loop with the URL updates.
    autoResetPageIndex: false,
    getRowId: (msg) => messageKey(msg),
  });

  const rows = table.getRowModel().rows;
  const visibleColumnCount = table.getVisibleLeafColumns().length;
  // A failed request has nothing to show either, but it must never look like the empty/waiting
  // states below — those read as "this topic genuinely has no matching messages," which is not
  // what a network/auth/timeout failure means.
  const showEmpty = !(error || isLoading) && rows.length === 0;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table data-testid="messages-table">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDir = header.column.getIsSorted();
                const label = (
                  <>
                    <table.FlexRender header={header} />
                    {sortDir === 'asc' && <ArrowUpIcon className="size-3.5" />}
                    {sortDir === 'desc' && <ArrowDownIcon className="size-3.5" />}
                  </>
                );
                return (
                  <TableHead
                    aria-sort={sortDir ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    // The table-corner action buttons (save / view settings) float over the
                    // header's top-right — keep the last column's title clear of them.
                    className="last:pr-20"
                    key={header.id}
                    title={
                      sortingDisabled && header.column.id === 'timestamp'
                        ? 'Turn off Load continuously to sort'
                        : undefined
                    }
                  >
                    {canSort ? (
                      <button
                        className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        {label}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">{label}</span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {!error && isLoading && rows.length === 0 && <LoadingRows columnCount={visibleColumnCount} />}
          {rows.map((row) => {
            const key = messageKey(row.original);
            return (
              <Fragment key={key}>
                {liveSeparatorKey === key && <LiveSeparatorRow columnCount={visibleColumnCount} key={`${key}-sep`} />}
                <TableRow
                  className={cn(
                    'cursor-pointer',
                    selectedKey === key && 'bg-accent/60',
                    newKeys.has(key) && 'animate-message-flash'
                  )}
                  data-state={selectedKey === key ? 'selected' : undefined}
                  data-testid="messages-table-row"
                  key={key}
                  onClick={() => onRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2.5')} key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      {error ? <ErrorState message={error} onRetry={onRetry} /> : null}
      {showEmpty && isLiveWaiting && <LiveWaitingState />}
      {showEmpty && !isLiveWaiting && (
        <Empty className="py-14" data-testid="messages-empty">
          <EmptyHeader>
            <EmptyTitle>{hasActiveFilter ? 'No messages match your filter.' : 'No messages'}</EmptyTitle>
            <EmptyDescription>
              {hasActiveFilter
                ? 'Clear the filter or widen the offset range to see records.'
                : 'This topic returned no records for the current read scope.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
