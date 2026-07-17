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

import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Label } from 'components/redpanda-ui/components/label';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { DataTablePagination } from 'components/redpanda-ui/components/data-table';
import { DataTableFilter, type FilterColumnConfig } from 'components/redpanda-ui/components/data-table-filter';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from 'components/redpanda-ui/components/sheet';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { createFilterFn } from 'components/redpanda-ui/lib/filter-utils';
import { useDataTableFilter } from 'components/redpanda-ui/lib/use-data-table-filter';
import { cn } from 'components/redpanda-ui/lib/utils';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useLogSearch } from '../../../react-query/api/logs';
import { type Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { TopicMessage } from '../../../state/rest-interfaces';
import { TimestampDisplay } from '../../../utils/tsx-utils';
import { cullText, prettyBytes } from '../../../utils/utils';
import { RefreshButton } from 'components/ui/refresh-button';
import { ArrowDown, ArrowUp, InfoIcon } from 'lucide-react';

const DEFAULT_PAGE_SIZE = 10;

// TanStack default; used to detect "unsized" columns.
const TANSTACK_DEFAULT_COLUMN_SIZE = 150;

type LogPayload = {
  message?: string;
  level?: string;
  time?: string;
  instance_id?: string;
  pipeline_id?: string;
  path?: string;
  label?: string;
  [key: string]: unknown;
};

function getLogPayload(msg: TopicMessage): LogPayload | null {
  const payload = msg.value?.payload;
  if (payload && typeof payload === 'object') {
    return payload as LogPayload;
  }
  return null;
}

// Keep head + tail so long component paths stay compact (full path on hover).
function abbreviateComponentPath(path: string): string {
  const parts = path.split('.');
  if (parts.length <= 3) {
    return path;
  }
  return `${parts[0]}…${parts.slice(-2).join('.')}`;
}

type LogLevelVariant = 'destructive-inverted' | 'warning-inverted' | 'info-inverted' | 'neutral-inverted';

function logLevelBadgeVariant(level: string | undefined): LogLevelVariant {
  switch (level?.toUpperCase()) {
    case 'ERROR':
      return 'destructive-inverted';
    case 'WARN':
    case 'WARNING':
      return 'warning-inverted';
    case 'INFO':
      return 'info-inverted';
    default:
      return 'neutral-inverted';
  }
}

function LogLevelBadge({ level }: { level: string | undefined }) {
  const display = level?.toUpperCase() ?? 'UNKNOWN';
  return (
    <Badge size="sm" variant={logLevelBadgeVariant(level)}>
      {display}
    </Badge>
  );
}


function LogDetailSheet({
  message,
  onClose,
}: {
  message: TopicMessage | null;
  onClose: () => void;
}) {
  const logPayload = message ? getLogPayload(message) : null;

  const valueCode = useMemo(() => {
    if (!message) return '';
    try {
      const payload = message.value?.payload;
      if (payload && typeof payload === 'object') {
        return JSON.stringify(payload, null, 2);
      }
      return message.valueJson ?? '';
    } catch {
      return message.valueJson ?? '';
    }
  }, [message]);

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={message !== null}>
      <SheetContent className="flex flex-col gap-6 overflow-y-auto" size="lg">
        {message && (
          <>
            <SheetHeader>
              <SheetTitle level={3}>
                <TimestampDisplay format="default" unixEpochMillisecond={message.timestamp} />
              </SheetTitle>
            </SheetHeader>

            <div className="grid grid-cols-[120px_1fr] gap-x-6 gap-y-4">
              <span className="text-label">Level</span>
              <span><LogLevelBadge level={logPayload?.level} /></span>

              {logPayload?.path && (
                <>
                  <span className="text-label">Component</span>
                  <span className="text-body">{logPayload.path}</span>
                </>
              )}

              <span className="text-label">Partition</span>
              <span className="text-body">{message.partitionID}</span>

              <span className="text-label">Offset</span>
              <span className="text-body">{message.offset}</span>

              {logPayload?.instance_id && (
                <>
                  <span className="text-label">Instance</span>
                  <span className="text-body">{logPayload.instance_id}</span>
                </>
              )}
            </div>

            {logPayload?.message && (
              <SimpleCodeBlock
                code={logPayload.message}
                language="text"
                title="Message"
                width="full"
              />
            )}

            <SimpleCodeBlock
              code={valueCode}
              language="json"
              maxHeight="lg"
              title="Value"
              width="full"
            />

            {message.headers.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-label">Headers ({message.headers.length})</span>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  {message.headers.map((h, i) => (
                    <div className="contents" key={`${h.key}-${i}`}>
                      <span className="text-body-sm text-muted-foreground">{h.key}</span>
                      <span className="text-body-sm">{String(h.value?.payload ?? '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}


interface LogExplorerProps {
  pipeline: Pipeline;
  /** Pass `isServerless()` from config — controls whether pipelineId filtering uses server-side pushdown or client-side. */
  serverless?: boolean;
  enableLiveView?: boolean;
  title?: ReactNode;
}

export function LogExplorer({ pipeline, serverless, enableLiveView = false, title }: LogExplorerProps) {
  const [liveViewEnabled, setLiveViewEnabled] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedMessage, setSelectedMessage] = useState<TopicMessage | null>(null);

  // Switching modes swaps the dataset, so reset page + sorting (a stale page index hides new logs).
  const setLiveView = (enabled: boolean) => {
    setLiveViewEnabled(enabled);
    setPageIndex(0);
    setSorting([]);
  };

  // Sync live mode on enableLiveView change, but not on mount — start in history.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) {
      setLiveViewEnabled(enableLiveView);
      setPageIndex(0);
      setSorting([]);
    }
    mountedRef.current = true;
  }, [enableLiveView]);

  const { messages, phase, error, progress, refresh } = useLogSearch({
    pipelineId: pipeline.id,
    live: liveViewEnabled,
    enabled: true,
    serverless,
  });


  const filterColumns = useMemo<FilterColumnConfig[]>(() => {
    const levelSet = new Set<string>();
    const pathSet = new Set<string>();

    for (const msg of messages) {
      const payload = getLogPayload(msg);
      if (payload?.level) levelSet.add(payload.level.toUpperCase());
      if (payload?.path) pathSet.add(payload.path);
    }

    const levelOptions = [...levelSet].sort().map((v) => ({ value: v, label: v }));
    const pathOptions = [...pathSet].sort().map((v) => ({ value: v, label: v }));

    return [
      { id: 'level', displayName: 'Log Level', type: 'option' as const, options: levelOptions },
      { id: 'path', displayName: 'Component', type: 'option' as const, options: pathOptions },
      { id: 'message', displayName: 'Message', type: 'text' as const, placeholder: 'Search messages...' },
    ];
  }, [messages]);


  const messageTableColumns = useMemo<ColumnDef<TopicMessage>[]>(
    () => [
      {
        header: 'Time',
        accessorKey: 'timestamp',
        enableSorting: !liveViewEnabled,
        cell: ({
          row: {
            original: { timestamp },
          },
        }) => {
          const d = new Date(timestamp);
          return (
            <div className="flex flex-col leading-tight" title={d.toLocaleString()}>
              <span className="text-xs text-muted-foreground tabular-nums">{d.toLocaleDateString()}</span>
              <span className="font-medium text-sm tabular-nums">{d.toLocaleTimeString()}</span>
            </div>
          );
        },
        minSize: 120,
        size: 132,
      },
      {
        id: 'level',
        header: 'Level',
        accessorFn: (row) => getLogPayload(row)?.level?.toUpperCase() ?? 'UNKNOWN',
        filterFn: createFilterFn('option'),
        enableSorting: !liveViewEnabled,
        cell: ({ row: { original } }) => <LogLevelBadge level={getLogPayload(original)?.level} />,
        minSize: 100,
        size: 100,
      },
      {
        id: 'path',
        header: 'Component',
        accessorFn: (row) => getLogPayload(row)?.path ?? '',
        filterFn: createFilterFn('option'),
        enableSorting: !liveViewEnabled,
        cell: ({ row: { original } }) => {
          const path = getLogPayload(original)?.path;
          if (!path) {
            return null;
          }
          return (
            <Tooltip>
              <TooltipTrigger
                render={<span className="text-body-sm block truncate text-muted-foreground">
                  {abbreviateComponentPath(path)}
                </span>} />
              <TooltipContent>{path}</TooltipContent>
            </Tooltip>
          );
        },
        minSize: 150,
        size: 180,
      },
      {
        id: 'message',
        header: 'Message',
        accessorFn: (row) => getLogPayload(row)?.message ?? row.valueJson ?? '',
        filterFn: createFilterFn('text'),
        enableSorting: false,
        cell: ({ row: { original } }) => {
          const logPayload = getLogPayload(original);
          const text = logPayload?.message ?? original.valueJson ?? '';
          return (
            <span className="text-body block truncate">
              {cullText(text, 200)}
            </span>
          );
        },
      },
    ],
    [liveViewEnabled],
  );

  const paginationParams = { pageIndex, pageSize };

  const table = useReactTable({
    data: messages,
    columns: messageTableColumns,
    state: {
      pagination: paginationParams,
      sorting,
    },
    onPaginationChange: (updater) => {
      const newState = typeof updater === 'function' ? updater(paginationParams) : updater;
      setPageIndex(newState.pageIndex);
      setPageSize(newState.pageSize);
    },
    onSortingChange: (updater) => {
      if (liveViewEnabled) return;
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(newSorting);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetPageIndex: false,
  });

  const { filters, actions } = useDataTableFilter({
    columns: filterColumns,
    table,
  });

  const isSearching = phase !== null;
  const filteredRowCount = table.getFilteredRowModel().rows.length;
  const hasProgress = progress.bytesConsumed > 0 || progress.messagesConsumed > 0;
  const pipelineNotRunning = pipeline.state !== Pipeline_State.RUNNING;

  // Clamp to the first page when filtering leaves the current page out of range.
  useEffect(() => {
    const pageCount = Math.ceil(filteredRowCount / pageSize);
    if (pageCount > 0 && pageIndex > pageCount - 1) {
      setPageIndex(0);
    }
  }, [filteredRowCount, pageSize, pageIndex]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {title ? (
            <h4 className="text-heading-sm">{title}</h4>
          ) : null}
          {!liveViewEnabled && (
            <DataTableFilter actions={actions} columns={filterColumns} filters={filters} table={table} />
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
          <Label className="cursor-pointer" htmlFor="live-view-toggle">
            {liveViewEnabled ? 'Live logs enabled' : 'Enable live logs'}
          </Label>
          <Tooltip>
            <TooltipTrigger
              render={<span className="inline-flex cursor-help" data-testid="log-live-tooltip-trigger">
                <InfoIcon className="size-4 text-muted-foreground" />
              </span>} />
            <TooltipContent side="top" testId="log-live-tooltip-content">
              {liveViewEnabled
                ? 'Showing new log messages as they arrive in real time.'
                : 'Showing the most recent log messages. Toggle on to see live logs as they arrive.'}
            </TooltipContent>
          </Tooltip>
          <Switch
            checked={liveViewEnabled}
            // Enlarged for discoverability (user feedback).
            className="h-5 w-9 **:data-[slot=switch-thumb]:size-4.5"
            data-testid="log-live-toggle"
            disabled={!enableLiveView}
            id="live-view-toggle"
            onCheckedChange={(checked) => {
              setLiveView(checked);
              if (checked) {
                actions.removeAllFilters();
              }
            }}
          />
          </div>
          <RefreshButton loading={isSearching} onClick={refresh} testId="log-refresh-button" />
        </div>
      </div>
      <div className="relative overflow-x-auto">
        <Table className="table-fixed" variant="simple">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={cn('px-3', header.column.getCanSort() && 'cursor-pointer select-none')}
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ minWidth: header.column.columnDef.minSize, width: header.getSize() !== TANSTACK_DEFAULT_COLUMN_SIZE ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' && <ArrowUp className="ml-1 inline size-3.5" />}
                    {header.column.getIsSorted() === 'desc' && <ArrowDown className="ml-1 inline size-3.5" />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {(() => {
              if (isSearching && messages.length === 0) {
                return (
                  <TableRow>
                    <TableCell className="py-10 text-center" colSpan={table.getVisibleFlatColumns().length}>
                      <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
                        {hasProgress ? (
                          <span className="text-body-sm text-muted-foreground" data-testid="log-search-progress">
                            {prettyBytes(progress.bytesConsumed)} scanned, {progress.messagesConsumed.toLocaleString()} messages checked
                          </span>
                        ) : (
                          <Spinner className="size-6" data-testid="log-loading-spinner" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
              if (error && messages.length === 0) {
                return (
                  <TableRow>
                    <TableCell className="p-4" colSpan={table.getVisibleFlatColumns().length}>
                      <Alert variant="destructive">
                        <AlertTitle>Failed to load logs</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    </TableCell>
                  </TableRow>
                );
              }
              if (liveViewEnabled && pipelineNotRunning && messages.length === 0) {
                return (
                  <TableRow>
                    <TableCell className="p-4" colSpan={table.getVisibleFlatColumns().length}>
                      <Alert data-testid="pipeline-stopped-banner" variant="info">
                        <AlertTitle>Pipeline is not running</AlertTitle>
                        <AlertDescription className="flex flex-col items-start gap-2">
                          Live logs require a running pipeline. Switch to recent logs to view historical logs.
                          <Button onClick={() => setLiveView(false)} size="sm" variant="secondary-outline">
                            Switch to Recent Logs
                          </Button>
                        </AlertDescription>
                      </Alert>
                    </TableCell>
                  </TableRow>
                );
              }
              if (filteredRowCount === 0) {
                let emptyText: string;
                if (messages.length > 0) {
                  emptyText = 'No messages match the current filters';
                } else if (liveViewEnabled) {
                  emptyText = 'Listening for new log messages… Switch to Recent Logs to view historical logs.';
                } else {
                  emptyText = 'No logs found for this pipeline.';
                }
                return (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={table.getVisibleFlatColumns().length}
                    >
                      {emptyText}
                    </TableCell>
                  </TableRow>
                );
              }
              const rows = table.getRowModel().rows;
              const placeholderColumns = table.getVisibleFlatColumns();
              // Pad partial pages to a constant height (capped at DEFAULT_PAGE_SIZE) so it doesn't jump.
              const placeholderCount = Math.max(0, Math.min(pageSize, DEFAULT_PAGE_SIZE) - rows.length);
              return (
                <>
                  {rows.map((row) => (
                    <TableRow className="cursor-pointer" key={row.id} onClick={() => setSelectedMessage(row.original)}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          className="px-3 py-2"
                          key={cell.id}
                          style={{ minWidth: cell.column.columnDef.minSize, width: cell.column.getSize() !== TANSTACK_DEFAULT_COLUMN_SIZE ? cell.column.getSize() : undefined }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {Array.from({ length: placeholderCount }, (_, i) => (
                    <TableRow aria-hidden className="pointer-events-none" key={`placeholder-${i}`}>
                      {placeholderColumns.map((column, columnIndex) => (
                        <TableCell className="px-3 py-2" key={column.id}>
                          {/* Mirror the Time cell's two-line height. */}
                          {columnIndex === 0 ? (
                            <div className="flex flex-col leading-tight">
                              <span className="text-xs">&nbsp;</span>
                              <span className="text-sm">&nbsp;</span>
                            </div>
                          ) : null}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              );
            })()}
          </TableBody>
        </Table>
      </div>
      {/* Hide DataTablePagination's "X of N row(s) selected." (no row selection) while keeping its layout slot. */}
      {filteredRowCount > 0 && (
        <div className="[&>div>div:first-child]:invisible">
          <DataTablePagination table={table} />
        </div>
      )}
      <LogDetailSheet message={selectedMessage} onClose={() => setSelectedMessage(null)} />
    </div>
  );
}
