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

import type { SortingState } from '@tanstack/react-table';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import type { ComponentStyleVars } from 'components/style-vars';
import '../styles.css';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge, type BadgeTone } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import {
  type DataTableColumnDef,
  DataTablePagination,
  useDataTable,
} from 'components/redpanda-ui/components/data-table';
import { DataTableFilter, type FilterColumnConfig } from 'components/redpanda-ui/components/data-table-filter';
import { Label } from 'components/redpanda-ui/components/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from 'components/redpanda-ui/components/sheet';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { createFilterFn } from 'components/redpanda-ui/lib/filter-utils';
import { useDataTableFilter } from 'components/redpanda-ui/lib/use-data-table-filter';
import { cn } from 'components/redpanda-ui/lib/utils';
import { RefreshButton } from 'components/ui/refresh-button';
import { ArrowDown, ArrowUp, InfoIcon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compareStrings, isNonEmptyString } from 'utils/string-utils';
import { isObject, stringValue } from 'utils/type-guards';

import { type Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useLogSearch } from '../../../react-query/api/logs';
import type { TopicMessage } from '../../../state/rest-interfaces';
import { TimestampDisplay } from '../../../utils/tsx-utils';
import { cullText, prettyBytes } from '../../../utils/utils';

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
  const payload: unknown = msg.value.payload;
  if (!isObject(payload)) {
    return null;
  }
  return {
    ...payload,
    message: stringValue(payload.message),
    level: stringValue(payload.level),
    time: stringValue(payload.time),
    instance_id: stringValue(payload.instance_id),
    pipeline_id: stringValue(payload.pipeline_id),
    path: stringValue(payload.path),
    label: stringValue(payload.label),
  };
}

// Keep head + tail so long component paths stay compact (full path on hover).
function abbreviateComponentPath(path: string): string {
  const parts = path.split('.');
  if (parts.length <= 3) {
    return path;
  }
  return `${parts[0]}…${parts.slice(-2).join('.')}`;
}

function logLevelBadgeTone(level: string | undefined): BadgeTone {
  const normalized = level?.toUpperCase() ?? '';
  switch (normalized) {
    case 'ERROR':
      return 'destructive';
    case 'WARN':
    case 'WARNING':
      return 'warning';
    case 'INFO':
      return 'informative';
    default:
      return 'default';
  }
}

function LogLevelBadge({ level }: { level: string | undefined }) {
  const display = level?.toUpperCase() ?? 'UNKNOWN';
  return (
    <Badge size="sm" tone={logLevelBadgeTone(level)} variant="subtle">
      {display}
    </Badge>
  );
}

function namedHeaders(headers: TopicMessage['headers']) {
  const counts = new Map<string, number>();
  return headers.map((header) => {
    const occurrence = counts.get(header.key) ?? 0;
    counts.set(header.key, occurrence + 1);
    return { ...header, id: `${header.key}:${occurrence}` };
  });
}

function LogDetailSheet({ message, onClose }: { message: TopicMessage | null; onClose: () => void }) {
  const logPayload = message ? getLogPayload(message) : null;

  const valueCode = useMemo(() => {
    if (!message) {
      return '';
    }
    try {
      const payload: unknown = message.value.payload;
      if (isObject(payload)) {
        return JSON.stringify(payload, null, 2) ?? message.valueJson ?? '';
      }
      return message.valueJson ?? '';
    } catch {
      return message.valueJson ?? '';
    }
  }, [message]);

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={message !== null}>
      <SheetContent className="overflow-y-auto" size="lg">
        <div className="flex flex-col gap-6">
          {message && (
            <>
              <SheetHeader>
                <SheetTitle level={3}>
                  <TimestampDisplay format="default" unixEpochMillisecond={message.timestamp} />
                </SheetTitle>
              </SheetHeader>

              <div className="grid grid-cols-[120px_1fr] gap-x-6 gap-y-4">
                <span className="text-label">Level</span>
                <span>
                  <LogLevelBadge level={logPayload?.level} />
                </span>

                {isNonEmptyString(logPayload?.path) && (
                  <>
                    <span className="text-label">Component</span>
                    <span className="text-body">{logPayload.path}</span>
                  </>
                )}

                <span className="text-label">Partition</span>
                <span className="text-body">{message.partitionID}</span>

                <span className="text-label">Offset</span>
                <span className="text-body">{message.offset}</span>

                {isNonEmptyString(logPayload?.instance_id) && (
                  <>
                    <span className="text-label">Instance</span>
                    <span className="text-body">{logPayload.instance_id}</span>
                  </>
                )}
              </div>

              {isNonEmptyString(logPayload?.message) && (
                <SimpleCodeBlock code={logPayload.message} language="text" title="Message" width="full" />
              )}

              <SimpleCodeBlock code={valueCode} language="json" maxHeight="lg" title="Value" width="full" />

              {message.headers.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-label">Headers ({message.headers.length})</span>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    {namedHeaders(message.headers).map((h) => (
                      <div className="contents" key={h.id}>
                        <span className="text-body-sm text-muted-foreground">{h.key}</span>
                        <span className="text-body-sm">{String(h.value?.payload ?? '')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type LogExplorerProps = {
  enableLiveView?: boolean;
  pipeline: Pipeline;
  /** Pass `isServerless()` from config — controls whether pipelineId filtering uses server-side pushdown or client-side. */
  serverless?: boolean;
  title?: ReactNode;
};

function logOptions(messages: TopicMessage[], field: 'level' | 'path') {
  const values = new Set<string>();
  for (const message of messages) {
    const value = getLogPayload(message)?.[field];
    if (isNonEmptyString(value)) {
      values.add(field === 'level' ? value.toUpperCase() : value);
    }
  }
  const sorted = [...values].sort(compareStrings);
  return sorted.map((value) => ({ value, label: value }));
}

function logFilterColumns(messages: TopicMessage[]): FilterColumnConfig[] {
  return [
    { id: 'level', displayName: 'Log Level', type: 'option', options: logOptions(messages, 'level') },
    { id: 'path', displayName: 'Component', type: 'option', options: logOptions(messages, 'path') },
    { id: 'message', displayName: 'Message', type: 'text', placeholder: 'Search messages...' },
  ];
}

function logMessageColumns(liveViewEnabled: boolean): DataTableColumnDef<TopicMessage>[] {
  return [
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
          <ElementTooltip content={d.toLocaleString()}>
            <div className="flex flex-col leading-tight">
              <span className="text-body-sm text-muted-foreground tabular-nums">{d.toLocaleDateString()}</span>
              <span className="text-body font-medium tabular-nums">{d.toLocaleTimeString()}</span>
            </div>
          </ElementTooltip>
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
        if (!isNonEmptyString(path)) {
          return null;
        }
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="block truncate text-body-sm text-muted-foreground">
                  {abbreviateComponentPath(path)}
                </span>
              }
            />
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
        return <span className="block truncate text-body">{cullText(text, 200)}</span>;
      },
    },
  ];
}

function useLogTableState(enableLiveView: boolean) {
  const [liveViewEnabled, setLiveViewEnabled] = useState(false);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  const [sorting, setSorting] = useState<SortingState>([]);
  const mountedRef = useRef(false);
  const setLiveView = useCallback((enabled: boolean) => {
    setLiveViewEnabled(enabled);
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
    setSorting([]);
  }, []);
  useEffect(() => {
    if (mountedRef.current) {
      setLiveView(enableLiveView);
    }
    mountedRef.current = true;
  }, [enableLiveView, setLiveView]);
  return { liveViewEnabled, pagination, sorting, setLiveView, setPagination, setSorting };
}

function useLogExplorerModel({ pipeline, serverless, enableLiveView = false }: LogExplorerProps) {
  const state = useLogTableState(enableLiveView);
  const search = useLogSearch({ pipelineId: pipeline.id, live: state.liveViewEnabled, enabled: true, serverless });
  const filterColumns = useMemo(() => logFilterColumns(search.messages), [search.messages]);
  const messageColumns = useMemo(() => logMessageColumns(state.liveViewEnabled), [state.liveViewEnabled]);
  const table = useDataTable({
    data: search.messages,
    columns: messageColumns,
    enableRowSelection: false,
    state: { pagination: state.pagination, sorting: state.sorting },
    onPaginationChange: state.setPagination,
    onSortingChange: (updater) => {
      if (!state.liveViewEnabled) {
        state.setSorting(updater);
      }
    },
    autoResetPageIndex: false,
  });
  const filtering = useDataTableFilter({ columns: filterColumns, table });
  const filteredRowCount = table.getFilteredRowModel().rows.length;
  useEffect(() => {
    const pageCount = Math.ceil(filteredRowCount / state.pagination.pageSize);
    if (pageCount > 0 && state.pagination.pageIndex > pageCount - 1) {
      state.setPagination((previous) => ({ ...previous, pageIndex: 0 }));
    }
  }, [filteredRowCount, state.pagination, state.setPagination]);
  return {
    ...state,
    ...search,
    ...filtering,
    table,
    filterColumns,
    filteredRowCount,
    isSearching: search.phase !== null,
    hasProgress: search.progress.bytesConsumed > 0 || search.progress.messagesConsumed > 0,
    pipelineNotRunning: pipeline.state !== Pipeline_State.RUNNING,
  };
}

type LogModel = ReturnType<typeof useLogExplorerModel>;

function LogToolbar({ model, title, enableLiveView }: { model: LogModel; title: ReactNode; enableLiveView: boolean }) {
  const { liveViewEnabled, isSearching, actions, filters, filterColumns, table, setLiveView, refresh } = model;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        {Boolean(title) ? <h4 className="text-heading-sm">{title}</h4> : null}
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
              render={
                <span className="inline-flex cursor-help" data-testid="log-live-tooltip-trigger">
                  <TonedIcon className="size-4" icon={InfoIcon} tone="muted" />
                </span>
              }
            />
            <TooltipContent side="top" testId="log-live-tooltip-content">
              {liveViewEnabled
                ? 'Showing recent log messages, with new ones added as they arrive.'
                : 'Showing the most recent log messages. Toggle on to see live logs as they arrive.'}
            </TooltipContent>
          </Tooltip>
          <Switch
            checked={liveViewEnabled}
            // Enlarged for discoverability (user feedback).
            className="console-log-live-switch"
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
        <RefreshButton
          disabled={liveViewEnabled || isSearching}
          loading={isSearching}
          onClick={refresh}
          testId="log-refresh-button"
        />
      </div>
    </div>
  );
}

const PLACEHOLDER_ROWS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

function LogDataRows({ model, onSelect }: { model: LogModel; onSelect: (message: TopicMessage) => void }) {
  const {
    table,
    pagination: { pageSize },
  } = model;
  const rows = table.getRowModel().rows;
  const placeholderColumns = table.getVisibleFlatColumns();
  // Pad partial pages to a constant height (capped at DEFAULT_PAGE_SIZE) so it doesn't jump.
  const placeholderCount = Math.max(0, Math.min(pageSize, DEFAULT_PAGE_SIZE) - rows.length);
  return (
    <>
      {rows.map((row) => (
        <TableRow className="cursor-pointer" key={row.id} onClick={() => onSelect(row.original)}>
          {row.getVisibleCells().map((cell) => {
            const style: ComponentStyleVars = {
              '--console-log-min-width':
                cell.column.columnDef.minSize === undefined ? undefined : `${cell.column.columnDef.minSize}px`,
              '--console-log-width':
                cell.column.getSize() === TANSTACK_DEFAULT_COLUMN_SIZE ? undefined : `${cell.column.getSize()}px`,
            };
            return (
              <TableCell className="console-log-cell" key={cell.id} style={style}>
                {<table.FlexRender cell={cell} />}
              </TableCell>
            );
          })}
        </TableRow>
      ))}
      {PLACEHOLDER_ROWS.slice(0, placeholderCount).map((slot) => (
        <TableRow aria-hidden className="pointer-events-none" key={slot}>
          {placeholderColumns.map((column, columnIndex) => (
            <TableCell className="console-log-cell" key={column.id}>
              {/* Mirror the Time cell's two-line height. */}
              {columnIndex === 0 ? (
                <div className="flex flex-col leading-tight">
                  <span className="text-body-sm">&nbsp;</span>
                  <span className="text-body">&nbsp;</span>
                </div>
              ) : null}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function emptyLogMessage(model: LogModel): string {
  if (model.messages.length > 0) {
    return 'No messages match the current filters';
  }
  if (model.liveViewEnabled) {
    return 'No recent logs. Listening for new log messages…';
  }
  return model.pipelineNotRunning
    ? 'No recent logs. Logs appear here once the pipeline is running.'
    : 'No logs found for this pipeline.';
}

function logBodyState(model: LogModel) {
  if (model.isSearching && model.messages.length === 0) {
    return 'searching';
  }
  if (isNonEmptyString(model.error) && model.messages.length === 0) {
    return 'error';
  }
  if (model.liveViewEnabled && model.pipelineNotRunning && model.messages.length === 0) {
    return 'stopped';
  }
  return model.filteredRowCount === 0 ? 'empty' : 'rows';
}

function LogRows({ model, onSelect }: { model: LogModel; onSelect: (message: TopicMessage) => void }) {
  const columnCount = model.table.getVisibleFlatColumns().length;
  switch (logBodyState(model)) {
    case 'searching':
      return (
        <TableRow>
          <TableCell align="center" className="console-log-status-cell" colSpan={columnCount}>
            <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
              {model.hasProgress ? (
                <span className="text-body-sm text-muted-foreground" data-testid="log-search-progress">
                  {prettyBytes(model.progress.bytesConsumed)} scanned,{' '}
                  {model.progress.messagesConsumed.toLocaleString()} messages checked
                </span>
              ) : (
                <>
                  <Spinner className="size-6" data-testid="log-loading-spinner" />
                  <span className="text-body-sm text-muted-foreground">Searching recent logs…</span>
                </>
              )}
            </div>
          </TableCell>
        </TableRow>
      );
    case 'error':
      return (
        <TableRow>
          <TableCell colSpan={columnCount}>
            <Alert variant="destructive">
              <AlertTitle>Failed to load logs</AlertTitle>
              <AlertDescription>{model.error}</AlertDescription>
            </Alert>
          </TableCell>
        </TableRow>
      );
    case 'stopped':
      return (
        <TableRow>
          <TableCell colSpan={columnCount}>
            <Alert data-testid="pipeline-stopped-banner" variant="informative">
              <AlertTitle>Pipeline is not running</AlertTitle>
              <AlertDescription>
                <div className="flex flex-col items-start gap-2">
                  Live logs require a running pipeline. Switch to recent logs to view historical logs.
                  <Button onClick={() => model.setLiveView(false)} size="sm" variant="outline">
                    Switch to Recent Logs
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </TableCell>
        </TableRow>
      );
    case 'empty':
      return (
        <TableRow>
          <TableCell align="center" className="console-log-status-cell" colSpan={columnCount}>
            <span className="text-muted-foreground">{emptyLogMessage(model)}</span>
          </TableCell>
        </TableRow>
      );
    case 'rows':
    default:
      return <LogDataRows model={model} onSelect={onSelect} />;
  }
}

function LogTable({ model, onSelect }: { model: LogModel; onSelect: (message: TopicMessage) => void }) {
  const { table } = model;
  return (
    <div className="relative overflow-x-auto">
      <Table className="table-fixed" variant="simple">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const style: ComponentStyleVars = {
                  '--console-log-min-width':
                    header.column.columnDef.minSize === undefined ? undefined : `${header.column.columnDef.minSize}px`,
                  '--console-log-width':
                    header.getSize() === TANSTACK_DEFAULT_COLUMN_SIZE ? undefined : `${header.getSize()}px`,
                };
                return (
                  <TableHead
                    className={cn('console-log-head', header.column.getCanSort() && 'cursor-pointer select-none')}
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={style}
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    {header.column.getIsSorted() === 'asc' && <ArrowUp className="ml-1 inline size-3.5" />}
                    {header.column.getIsSorted() === 'desc' && <ArrowDown className="ml-1 inline size-3.5" />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          <LogRows model={model} onSelect={onSelect} />
        </TableBody>
      </Table>
    </div>
  );
}

export function LogExplorer(props: LogExplorerProps) {
  const model = useLogExplorerModel(props);
  const [selectedMessage, setSelectedMessage] = useState<TopicMessage | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <LogToolbar enableLiveView={props.enableLiveView ?? false} model={model} title={props.title} />
      <LogTable model={model} onSelect={setSelectedMessage} />
      {model.filteredRowCount > 0 && <DataTablePagination table={model.table} />}
      <LogDetailSheet message={selectedMessage} onClose={() => setSelectedMessage(null)} />
    </div>
  );
}
