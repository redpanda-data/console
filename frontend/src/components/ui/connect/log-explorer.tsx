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
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { DataTablePagination } from 'components/redpanda-ui/components/data-table';
import { DataTableFilter, type FilterColumnConfig } from 'components/redpanda-ui/components/data-table-filter';
import { Label } from 'components/redpanda-ui/components/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from 'components/redpanda-ui/components/sheet';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { createFilterFn } from 'components/redpanda-ui/lib/filter-utils';
import { useDataTableFilter } from 'components/redpanda-ui/lib/use-data-table-filter';
import { InfoIcon, RefreshCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useLogSearch } from '../../../react-query/api/logs';
import type { Pipeline } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { TopicMessage } from '../../../state/rest-interfaces';
import { TimestampDisplay } from '../../../utils/tsx-utils';
import { cullText } from '../../../utils/utils';

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

  const keyCode = useMemo(() => {
    if (!message) return '';
    return message.keyJson ?? '';
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

            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <Text as="span" variant="labelStrongSmall">Level</Text>
              <LogLevelBadge level={logPayload?.level} />

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

            <SimpleCodeBlock
              code={valueCode}
              language="json"
              maxHeight="lg"
              title="Value"
              width="full"
            />

            {keyCode && (
              <SimpleCodeBlock
                code={keyCode}
                maxHeight="sm"
                title="Key"
                width="full"
              />
            )}

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
}

export function LogExplorer({ pipeline, serverless }: LogExplorerProps) {
  const [liveViewEnabled, setLiveViewEnabled] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedMessage, setSelectedMessage] = useState<TopicMessage | null>(null);

  const { messages, phase, error, refresh } = useLogSearch({
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

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {!liveViewEnabled && (
            <DataTableFilter actions={actions} columns={filterColumns} filters={filters} table={table} />
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={liveViewEnabled}
              id="live-view-toggle"
              onCheckedChange={(checked) => {
                setLiveViewEnabled(checked);
                setSorting([]);
                if (checked) {
                  actions.removeAllFilters();
                }
              }}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex gap-1">
                  <Label htmlFor="live-view-toggle">Live</Label>
                  <InfoIcon className="size-4 text-muted-foreground" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Continuously load new log messages as they arrive. When disabled, shows logs from the last 5 hours.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <Button
          data-testid="log-refresh-button"
          disabled={isSearching}
          onClick={refresh}
          size="icon"
          variant="ghost"
        >
          <RefreshCcw className={isSearching ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load logs</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="min-h-0 overflow-auto">
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
                      <Spinner className="size-6" data-testid="log-loading-spinner" />
                    </TableCell>
                  </TableRow>
                );
              }
              if (filteredRowCount === 0) {
                return (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={table.getVisibleFlatColumns().length}
                    >
                      {messages.length === 0 ? 'No messages' : 'No messages match the current filters'}
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

      {/* Pagination (client-side only) */}
      {filteredRowCount > 0 && (
        <DataTablePagination
          pagination={{
            canNextPage: table.getCanNextPage(),
            canPreviousPage: table.getCanPreviousPage(),
            pageCount: table.getPageCount(),
            pageIndex: paginationParams.pageIndex,
            pageSize: paginationParams.pageSize,
          }}
          table={table}
        />
      )}

      {/* Detail sheet */}
      <LogDetailSheet message={selectedMessage} onClose={() => setSelectedMessage(null)} />
    </div>
  );
}
