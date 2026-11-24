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

import { ElementTooltip } from 'components/misc/element-tooltip';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { SyncCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { Kbd, KbdGroup } from 'components/redpanda-ui/components/kbd';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusDot } from 'components/redpanda-ui/components/status-dot';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  Braces,
  CircleSlash,
  CircleX,
  Clock,
  Database,
  Download,
  GitMerge,
  Lightbulb,
  Plus,
  Rows3,
  Terminal,
  X,
} from 'lucide-react';
import { createContext, useContext, useMemo, useState } from 'react';
import { type Column, DataGrid } from 'react-data-grid';
import { isMacOS } from 'utils/platform';

import 'react-data-grid/lib/styles.css';
import './sql-results.css';

import type {
  BridgeInfo,
  CellValue,
  ColumnDef,
  ColumnKind,
  QueryRun,
  QueryRunSuccess,
  ResultRow,
  SqlRole,
} from './sql-types';
import { TonedIcon } from '../shared/toned-icon';

export type SqlResultsProps = {
  /** Current run state: idle | running | canceled | error | success. */
  run: QueryRun;
  /** Effective role; gates the admin "Add a topic" CTA on CREATE errors. */
  sqlRole: SqlRole;
  /** Admin entry point for the add-topic wizard. */
  onAddTable?: () => void;
  /** Stops the in-flight run; renders the Cancel button while running. */
  onCancel?: () => void;
  /** Whether the Redpanda catalog has any tables; drives the idle empty state. */
  hasTables?: boolean;
};

const fmtNum = (n: number) => n.toLocaleString('en-US');
const offStr = (n: number) => `${fmtNum(n)} offset${n === 1 ? '' : 's'}`;
const CSV_ESCAPE_RE = /[",\n]/u;
const CSV_QUOTE_RE = /"/gu;
const CSV_FORMULA_RE = /^[=+\-@]/u;

const RES_STAT =
  'inline-flex items-center gap-1.5 text-body-sm text-foreground [font-variant-numeric:tabular-nums] [&_svg]:text-muted-foreground';

function BridgeBar() {
  return (
    <Badge size="md" tone="default">
      <GitMerge /> Bridge query
    </Badge>
  );
}

function PendingStat({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-success">
      <StatusDot size="xxs" variant="success" /> {fmtNum(count)} {label}
    </span>
  );
}

function BridgeTimeline({ bridge }: { bridge: BridgeInfo }) {
  if (bridge.totalLag === 0) {
    return null;
  }
  return (
    <div className="shrink-0 border-b border-border bg-card px-4 pt-3 pb-3.5">
      <div className="text-body-sm leading-snug text-muted-foreground">
        Bridge query covers <strong>{offStr(bridge.totalLag)}</strong> not yet in Iceberg at query time —{' '}
        <PendingStat count={bridge.translationLag} label="pending translation" /> +{' '}
        <PendingStat count={bridge.commitLag} label="pending commit" />. Bridging serves them from the topic so results
        stay realtime.
      </div>
    </div>
  );
}

function cellText(v: CellValue) {
  return v === null || v === undefined ? '' : String(v);
}

const CELL_MAX_W = 'max-w-80';
const CELL_CLAMP_CHARS = 45;
const GRID_HEADER_H = 52;

function prettyJson(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const CellPopoverContainerContext = createContext<HTMLElement | null>(null);

const TRACK_AND_CLIP = { side: 'flip', align: 'none' } as const;

function JsonCellPopover({ value, name, typeLabel }: { value: string; name: string; typeLabel: string }) {
  const [open, setOpen] = useState(false);
  const container = useContext(CellPopoverContainerContext);
  const pretty = useMemo(() => prettyJson(value), [value]);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <ElementTooltip content="Show JSON">
        <PopoverTrigger
          render={
            <button
              className={cn(
                'block cursor-pointer truncate text-left font-mono underline decoration-dotted underline-offset-2',
                CELL_MAX_W
              )}
              type="button"
            >
              {value}
            </button>
          }
        />
      </ElementTooltip>
      <PopoverContent
        align="start"
        className="pointer-events-auto w-120 max-w-[90vw] overflow-hidden"
        collisionAvoidance={TRACK_AND_CLIP}
        container={container ?? undefined}
      >
        <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2">
          <TonedIcon className="shrink-0" icon={Braces} size={14} tone="informative" />
          <span className="truncate font-mono text-body font-semibold text-strong">{name}</span>
          <span className="text-body-sm text-muted-foreground">·</span>
          <span className="shrink-0 font-mono text-body-sm tracking-wide text-muted-foreground uppercase">
            {typeLabel}
          </span>
          <span className="flex-1" />
          <CopyButton className="size-7" content={pretty} size="icon" variant="ghost" />
          <Button aria-label="Close" className="size-7" onClick={() => setOpen(false)} size="sm" variant="ghost">
            <X size={14} />
          </Button>
        </div>
        <SyncCodeBlock
          allowCopy={false}
          className="!my-0"
          code={pretty}
          keepBackground
          lang="json"
          themes={{ dark: 'github-dark', light: 'github-light' }}
          viewportProps={{ className: 'max-h-96' }}
        />
      </PopoverContent>
    </Popover>
  );
}

function LongCellPopover({ value }: { value: string }) {
  const container = useContext(CellPopoverContainerContext);
  return (
    <Popover>
      <ElementTooltip content="Show full value">
        <PopoverTrigger
          render={
            <button
              className={cn(
                'block cursor-pointer truncate text-left underline decoration-dotted underline-offset-2',
                CELL_MAX_W
              )}
              type="button"
            >
              {value}
            </button>
          }
        />
      </ElementTooltip>
      <PopoverContent
        align="start"
        className="pointer-events-auto max-h-72 max-w-120 overflow-auto"
        collisionAvoidance={TRACK_AND_CLIP}
        container={container ?? undefined}
      >
        <div className="font-mono text-body-sm break-all whitespace-pre-wrap">{value}</div>
      </PopoverContent>
    </Popover>
  );
}

function CellContent({
  v,
  kind,
  name,
  typeLabel,
}: {
  v: CellValue;
  kind: ColumnKind;
  name: string;
  typeLabel: string;
}) {
  if (kind === 'bool' && typeof v === 'boolean') {
    return <span className="font-semibold">{String(v)}</span>;
  }
  if (v === null || v === undefined) {
    return <span className="text-disabled italic">NULL</span>;
  }
  const s = String(v);
  if (kind === 'json') {
    return <JsonCellPopover name={name} typeLabel={typeLabel} value={s} />;
  }
  if (s.length <= CELL_CLAMP_CHARS) {
    return <span className={cn('block truncate', CELL_MAX_W)}>{s}</span>;
  }
  return <LongCellPopover value={s} />;
}

function csvField(v: CellValue) {
  const raw = cellText(v);
  const s = CSV_FORMULA_RE.test(raw) ? `'${raw}` : raw;
  return CSV_ESCAPE_RE.test(s) ? `"${s.replace(CSV_QUOTE_RE, '""')}"` : s;
}

function toCsv(cols: ColumnDef[], rows: ResultRow[]) {
  const head = cols.map((c) => c.name).join(',');
  const body = rows.map((r) => cols.map((c) => csvField(r[c.name])).join(',')).join('\n');
  return `${head}\n${body}`;
}

function exportBlob(fmt: 'csv' | 'json', cols: ColumnDef[], rows: ResultRow[]) {
  if (fmt === 'json') {
    return new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  }
  return new Blob([toCsv(cols, rows)], { type: 'text/csv' });
}

function exportData(fmt: 'csv' | 'json', cols: ColumnDef[], rows: ResultRow[]) {
  const url = URL.createObjectURL(exportBlob(fmt, cols, rows));
  const a = document.createElement('a');
  a.href = url;
  a.download = `query_result.${fmt}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildRowKeys(rows: ResultRow[]) {
  const map = new WeakMap<ResultRow, number>();
  rows.forEach((r, i) => {
    map.set(r, i);
  });
  return map;
}

const ROWNUM_KEY = '__rownum__';

function buildColumns(cols: ColumnDef[]) {
  const rowNum: Column<ResultRow> = {
    key: ROWNUM_KEY,
    name: '',
    frozen: true,
    resizable: false,
    width: 'max-content',
    renderHeaderCell: () => <span className="font-mono text-body-sm text-disabled">#</span>,
    renderCell: ({ rowIdx }) => rowIdx + 1,
    cellClass: 'sql-results-rownum text-right font-mono text-disabled text-body-sm [user-select:none]',
  };
  const dataCols = cols.map((c): Column<ResultRow> => {
    const alignRight = c.kind === 'num';
    return {
      key: c.name,
      name: c.name,
      width: 'minmax(max-content, 1fr)',
      minWidth: 96,
      // Headers stay left-aligned for every kind; only numeric cell values
      // right-align (so digits line up) — keep the column name readable.
      renderHeaderCell: () => (
        <span className="flex h-full flex-col items-start justify-center gap-[3px] font-sans leading-none">
          <span className="font-mono text-body-sm font-semibold text-strong">{c.name}</span>
          <span className="inline-flex items-center gap-1 text-2xs font-normal tracking-wide text-muted-foreground uppercase">
            {c.short}
          </span>
        </span>
      ),
      renderCell: ({ row }) => <CellContent kind={c.kind} name={c.name} typeLabel={c.short} v={row[c.name]} />,
      cellClass: cn('font-mono text-body-sm', alignRight && 'text-right'),
    };
  });
  return [rowNum, ...dataCols] satisfies Column<ResultRow>[];
}

function SuccessGrid({ run }: { run: QueryRunSuccess }) {
  const cols = run.columns;
  const bridge = run.bridge;

  const columns = useMemo(() => buildColumns(cols), [cols]);
  const rowKeys = useMemo(() => buildRowKeys(run.rows), [run.rows]);

  const [clipEl, setClipEl] = useState<HTMLElement | null>(null);

  return (
    <CellPopoverContainerContext.Provider value={clipEl}>
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="flex shrink-0 items-center gap-4 border-b border-border bg-card px-4 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            {bridge ? (
              <BridgeBar />
            ) : (
              <span className={cn(RES_STAT, 'font-semibold text-success')}>
                <StatusDot size="xxs" variant="success" /> Success
              </span>
            )}
            <span className={cn(RES_STAT, bridge && 'whitespace-nowrap')}>
              <Rows3 size={14} /> {fmtNum(run.totalRows)} rows
            </span>
            <span className={cn(RES_STAT, bridge && 'whitespace-nowrap')}>
              <Clock size={14} /> {run.elapsedMs} ms
            </span>
            {run.truncated ? (
              <Badge
                size="sm"
                title="The server row cap fired; not all rows were returned."
                tone="warning"
                variant="subtle"
              >
                truncated
              </Badge>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button onClick={() => exportData('csv', cols, run.rows)} size="xs" variant="ghost">
              <Download size={13} /> CSV
            </Button>
            <Button onClick={() => exportData('json', cols, run.rows)} size="xs" variant="ghost">
              <Download size={13} /> JSON
            </Button>
          </div>
        </div>

        {bridge ? <BridgeTimeline bridge={bridge} /> : null}

        {/* Virtualized grid: rdg renders only visible rows, so the full result
          set is handed over with no client-side pagination. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <DataGrid
            className="sql-results-grid"
            columns={columns}
            headerRowHeight={GRID_HEADER_H}
            rowClass={(_, i) => (i % 2 === 1 ? 'sql-results-row-alt' : undefined)}
            rowHeight={30}
            rowKeyGetter={(r) => rowKeys.get(r) ?? -1}
            rows={run.rows}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
            ref={setClipEl}
            style={{ top: GRID_HEADER_H }}
          />
        </div>
      </div>
    </CellPopoverContainerContext.Provider>
  );
}

type IdleResultsProps = Pick<SqlResultsProps, 'sqlRole' | 'onAddTable'> & { hasTables: boolean };

function IdleResults({ sqlRole, onAddTable, hasTables }: IdleResultsProps) {
  if (!hasTables) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Database />
          </EmptyMedia>
          <EmptyTitle>No tables yet</EmptyTitle>
          <EmptyDescription>
            {sqlRole === 'admin'
              ? 'Create a table from a Redpanda topic to start querying it with SQL.'
              : 'Ask an admin to create a table from a Redpanda topic before you can query it with SQL.'}
          </EmptyDescription>
        </EmptyHeader>
        {sqlRole === 'admin' && onAddTable ? (
          <EmptyContent>
            <Button onClick={onAddTable} size="sm" variant="primary">
              <Plus size={14} /> Add a topic to SQL
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  const modKey = isMacOS() ? '⌘' : 'Ctrl';

  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Terminal />
        </EmptyMedia>
        <EmptyTitle>Run a query to see results</EmptyTitle>
        <EmptyDescription>
          Write a <InlineCode>SELECT</InlineCode> against a table in the catalog, then press{' '}
          <KbdGroup>
            <Kbd size="xs">{modKey}</Kbd>
            <Kbd size="xs">↵</Kbd>
          </KbdGroup>{' '}
          or hit Run.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function RunningResults({ onCancel }: Pick<SqlResultsProps, 'onCancel'>) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TonedIcon className="size-6" icon={Spinner} tone="action" />
        </EmptyMedia>
        <EmptyTitle>Running query…</EmptyTitle>
      </EmptyHeader>
      {onCancel ? (
        <EmptyContent>
          <Button onClick={onCancel} size="sm" variant="outline">
            <X /> Cancel
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function SqlResults({ run, sqlRole, onAddTable, onCancel, hasTables = true }: SqlResultsProps) {
  if (run.state === 'idle') {
    return <IdleResults hasTables={hasTables} onAddTable={onAddTable} sqlRole={sqlRole} />;
  }

  if (run.state === 'running') {
    return <RunningResults onCancel={onCancel} />;
  }

  if (run.state === 'canceled') {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleSlash />
          </EmptyMedia>
          <EmptyTitle>Query canceled</EmptyTitle>
          <EmptyDescription>The query was stopped before it finished.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (run.state === 'error') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-3.5 overflow-y-auto p-6">
        <Alert icon={<CircleX />} variant="destructive">
          <AlertTitle>{run.title}</AlertTitle>
          <AlertDescription>{run.message}</AlertDescription>
        </Alert>
        {run.hint ? (
          <Alert icon={<Lightbulb />} variant="informative">
            <AlertTitle>Hint</AlertTitle>
            <AlertDescription>
              {run.hint}
              {run.hintAction && sqlRole === 'admin' && onAddTable ? (
                <Button onClick={onAddTable} size="sm" variant="primary">
                  <Plus size={14} /> Add a topic to SQL
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return <SuccessGrid key={run.token} run={run} />;
}
