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
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Label } from 'components/redpanda-ui/components/label';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { DataTablePagination } from 'components/redpanda-ui/components/data-table';
import { DataTableFilter, type FilterColumnConfig } from 'components/redpanda-ui/components/data-table-filter';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from 'components/redpanda-ui/components/sheet';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Text } from 'components/redpanda-ui/components/typography';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { createFilterFn } from 'components/redpanda-ui/lib/filter-utils';
import { useDataTableFilter } from 'components/redpanda-ui/lib/use-data-table-filter';
import { Progress } from 'components/redpanda-ui/components/progress';
import { useMemo, useState } from 'react';

import { useLogSearch } from '../../../react-query/api/logs';
import { type Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { TopicMessage } from '../../../state/rest-interfaces';
import { TimestampDisplay } from '../../../utils/tsx-utils';
import { cullText, prettyBytes } from '../../../utils/utils';
import { RefreshIcon } from 'components/icons';
import { InfoIcon } from 'lucide-react';

const DEFAULT_PAGE_SIZE = 10;

/**
 * TanStack Table assigns a default size of 150 to columns without an explicit `size`.
 * We use this to detect "unsized" columns and avoid applying a fixed width.
 */
const TANSTACK_DEFAULT_COLUMN_SIZE = 150;

// --- Log payload helpers ---

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

// --- Sheet detail view ---

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
              <Text as="span" variant="labelStrongSmall">Level</Text>
              <span><LogLevelBadge level={logPayload?.level} /></span>

              {logPayload?.path && (
                <>
                  <Text as="span" variant="labelStrongSmall">Component</Text>
                  <Text as="span" variant="bodyMedium">{logPayload.path}</Text>
                </>
              )}

              <Text as="span" variant="labelStrongSmall">Partition</Text>
              <Text as="span" variant="bodyMedium">{message.partitionID}</Text>

              <Text as="span" variant="labelStrongSmall">Offset</Text>
              <Text as="span" variant="bodyMedium">{message.offset}</Text>

              {logPayload?.instance_id && (
                <>
                  <Text as="span" variant="labelStrongSmall">Instance</Text>
                  <Text as="span" variant="bodyMedium">{logPayload.instance_id}</Text>
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
                <Text as="span" variant="labelStrongSmall">Headers ({message.headers.length})</Text>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  {message.headers.map((h, i) => (
                    <div className="contents" key={`${h.key}-${i}`}>
                      <Text as="span" className="text-muted-foreground" variant="bodySmall">{h.key}</Text>
                      <Text as="span" variant="bodySmall">{String(h.value?.payload ?? '')}</Text>
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

// --- Main component ---

interface LogExplorerProps {
  pipeline: Pipeline;
  /** Pass `isServerless()` from config — controls whether pipelineId filtering uses server-side pushdown or client-side. */
  serverless?: boolean;
  /** Whether to enable the live view. Defaults to false. */
  enableLiveView?: boolean;
}

export function LogExplorer({ pipeline, serverless, enableLiveView = false }: LogExplorerProps) {
  const [liveViewEnabled, setLiveViewEnabled] = useState(false);

  // Auto-enable live mode when pipeline transitions to RUNNING
  const [prevEnableLiveView, setPrevEnableLiveView] = useState(enableLiveView);
  if (enableLiveView !== prevEnableLiveView) {
    setPrevEnableLiveView(enableLiveView);
    if (enableLiveView) {
      setLiveViewEnabled(true);
    }
  }

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedMessage, setSelectedMessage] = useState<TopicMessage | null>(null);

  const { messages, phase, error, progress, refresh } = useLogSearch({
    pipelineId: pipeline.id,
    live: liveViewEnabled,
    enabled: true,
    serverless,
  });

  // --- Filter columns (dynamic options from loaded messages) ---

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

  // --- Table columns ---

  const messageTableColumns = useMemo<ColumnDef<TopicMessage>[]>(
    () => [
      {
        header: 'Timestamp',
        accessorKey: 'timestamp',
        enableSorting: !liveViewEnabled,
        cell: ({
          row: {
            original: { timestamp },
          },
        }) => <TimestampDisplay format="default" unixEpochMillisecond={timestamp} />,
        minSize: 200,
        size: 200,
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
          return path ? (
            <Text as="span" className="text-muted-foreground" variant="bodySmall">{path}</Text>
          ) : null;
        },
        minSize: 140,
        size: 160,
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
            <Text as="span" variant="bodyMedium">
              {cullText(text, 200)}
            </Text>
          );
        },
        size: Number.POSITIVE_INFINITY,
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
  const pipelineNotRunning = pipeline.state === Pipeline_State.STOPPED || pipeline.state === Pipeline_State.ERROR || pipeline.state === Pipeline_State.COMPLETED;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!liveViewEnabled && (
            <DataTableFilter actions={actions} columns={filterColumns} filters={filters} table={table} />
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger>
              <Label className="cursor-pointer" htmlFor="live-view-toggle">
                {liveViewEnabled ? 'Live logs enabled' : 'Enable live logs'}  
              </Label>
              <InfoIcon className="size-4 ml-1 text-muted-foreground" data-testid="log-live-tooltip-trigger" />
            </TooltipTrigger>
            <TooltipContent side="top" testId="log-live-tooltip-content">
              {liveViewEnabled
                ? 'Showing new log messages as they arrive in real time.'
                : 'Showing log messages from the last 5 hours. Toggle on to see live logs as they arrive.'}
            </TooltipContent>
          </Tooltip>
          <Switch
            checked={liveViewEnabled}
            // overriding size to make it more prominent, user feedback showed it was not discoverable
            className="h-5 w-9 **:data-[slot=switch-thumb]:size-4.5"
            data-testid="log-live-toggle"
            disabled={!enableLiveView}
            id="live-view-toggle"
            onCheckedChange={(checked) => {
              setLiveViewEnabled(checked);
              setSorting([]);
              if (checked) {
                actions.removeAllFilters();
              }
            }}
          />
          </div>
          <Button
            data-testid="log-refresh-button"
            disabled={isSearching}
            onClick={refresh}
            size="icon"
            variant="ghost"
          >
            <RefreshIcon className={isSearching ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="relative min-h-0">
        {/* Progress bar overlaying top of table */}
        {isSearching && hasProgress && (
          <div className="absolute inset-x-0 top-0 z-10">
            <Progress className="h-1 w-full rounded-none" testId="log-progress-bar" value={null} />
          </div>
        )}
        <div className="overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ minWidth: header.column.columnDef.minSize, width: header.getSize() !== TANSTACK_DEFAULT_COLUMN_SIZE ? header.getSize() : undefined }}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' && ' \u2191'}
                    {header.column.getIsSorted() === 'desc' && ' \u2193'}
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
                          <Text as="span" className="text-muted-foreground" data-testid="log-search-progress" variant="bodySmall">
                            {prettyBytes(progress.bytesConsumed)} scanned, {progress.messagesConsumed.toLocaleString()} messages checked
                          </Text>
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
                        <AlertDescription>
                          Live logs require a running pipeline.{' '}
                          <button
                            className="font-medium underline"
                            onClick={() => setLiveViewEnabled(false)}
                            type="button"
                          >
                            Switch to Recent Logs
                          </button>{' '}
                          to view historical logs.
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
                  emptyText = 'No logs found in the last 5 hours for this pipeline.';
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
              return table.getRowModel().rows.map((row) => (
                <TableRow
                  className="cursor-pointer"
                  key={row.id}
                  onClick={() => setSelectedMessage(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ minWidth: cell.column.columnDef.minSize, width: cell.column.getSize() !== TANSTACK_DEFAULT_COLUMN_SIZE ? cell.column.getSize() : undefined }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ));
            })()}
          </TableBody>
        </Table>
        </div>
      </div>

      {/* Pagination (client-side only) */}
      {filteredRowCount > 0 && (
        <DataTablePagination table={table} />
      )}

      {/* Detail sheet */}
      <LogDetailSheet message={selectedMessage} onClose={() => setSelectedMessage(null)} />
    </div>
  );
}
