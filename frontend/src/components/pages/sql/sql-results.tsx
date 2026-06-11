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

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Kbd, KbdGroup } from 'components/redpanda-ui/components/kbd';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { StatusDot } from 'components/redpanda-ui/components/status-dot';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  Activity,
  Box,
  Braces,
  Brackets,
  Calendar,
  CircleX,
  Clock,
  Download,
  GitMerge,
  Hash,
  Plus,
  Rows3,
  Terminal,
  ToggleLeft,
  Type,
  Waves,
} from 'lucide-react';
import type { ReactNode } from 'react';
import DataGrid, { type Column } from 'react-data-grid';

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

export type SqlResultsProps = {
  /** Current run state: idle | running | error | success. */
  run: QueryRun;
  /** Effective role; gates the admin "Add a topic" CTA on CREATE errors. */
  role: SqlRole;
  /** Admin entry point for the add-topic wizard. */
  onAddTable?: () => void;
};

const fmtNum = (n: number) => n.toLocaleString('en-US');
const offStr = (n: number) => `${fmtNum(n)} offset${n === 1 ? '' : 's'}`;

// Shared inline-stat layout used across the summary bar.
const RES_STAT =
  'inline-flex items-center gap-1.5 text-xs text-foreground [font-variant-numeric:tabular-nums] [&_svg]:text-muted-foreground';

function TypeIcon({ kind, isArray, size = 11 }: { kind: ColumnKind; isArray?: boolean; size?: number }) {
  let icon: ReactNode;
  switch (kind) {
    case 'num':
      icon = <Hash size={size} />;
      break;
    case 'bool':
      icon = <ToggleLeft size={size} />;
      break;
    case 'time':
      icon = <Calendar size={size} />;
      break;
    case 'json':
      icon = <Braces size={size} />;
      break;
    default:
      icon = <Type size={size} />;
  }
  if (!isArray) {
    return icon;
  }
  return (
    <span className="inline-flex items-center gap-[1px]">
      <Brackets size={size} />
      {icon}
    </span>
  );
}

// Inline chip + Iceberg-lag snapshot shown in the summary bar for bridge queries.
function BridgeBar({ bridge }: { bridge: BridgeInfo }) {
  return (
    <>
      <Badge className="rounded-full bg-accent font-semibold text-accent-foreground" size="md" variant="neutral">
        <GitMerge /> Bridge query
      </Badge>
      {bridge.totalLag > 0 && (
        <span
          className={cn(RES_STAT, 'whitespace-nowrap font-mono text-muted-foreground text-xs')}
          title="Iceberg lag at query time"
        >
          <Waves size={13} /> Iceberg {offStr(bridge.totalLag)} behind{' '}
          <span className="ml-[3px] whitespace-nowrap font-normal text-caption-sm text-disabled not-italic">
            at query time
          </span>
        </span>
      )}
    </>
  );
}

function PendingStat({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-success">
      <StatusDot size="xxs" variant="success" /> {fmtNum(count)} {label}
    </span>
  );
}

// Horizontal timeline: Iceberg history meshed with the live topic tail at the
// watermark. Segment widths are illustrative; the offset counts are the real
// metric snapshot captured at query time.
function BridgeTimeline({ bridge }: { bridge: BridgeInfo }) {
  // The bar always renders; only the lag-specific labels/caption (and the
  // "in sync" wording, which we don't surface) are conditional.
  const caught = bridge.totalLag === 0;
  return (
    <div className="flex-shrink-0 border-border border-b bg-card px-4 pt-3 pb-3.5">
      <div className="mb-[7px] flex justify-between font-semibold text-xs">
        <span className="inline-flex items-center gap-[5px] text-info">
          <Box size={12} /> Iceberg history
        </span>
        {!caught && (
          <span className="inline-flex items-center gap-[5px] text-success">
            <Activity size={12} /> Live topic tail
          </span>
        )}
      </div>
      <div className="relative flex h-[30px] items-stretch">
        {/* Iceberg segment. When caught up it closes its right edge (full
            radius); otherwise it abuts the live segment. */}
        <div
          className={cn(
            'flex min-w-0 items-center border border-info border-r-0 bg-info-subtle px-[11px]',
            caught ? 'w-full rounded-md border-r' : 'w-[74%] rounded-l-md'
          )}
        />
        {!caught && (
          <>
            <div className="relative z-[2] w-0 self-stretch border-subtle border-l-2 border-dashed">
              <Badge
                className="absolute bottom-[-2px] left-1/2 z-[3] -translate-x-1/2 translate-y-[120%] rounded-full bg-muted font-bold text-caption-sm text-foreground uppercase tracking-wide"
                size="sm"
                variant="outline"
              >
                watermark · {offStr(bridge.totalLag)}
              </Badge>
            </div>
            {/* Live-tail segment with the 45deg hatch overlay. */}
            <div className="relative w-[26%] overflow-hidden rounded-r-md border border-success border-l-0 bg-background-success-subtle after:absolute after:inset-0 after:content-[''] after:[background:repeating-linear-gradient(45deg,transparent,transparent_5px,var(--color-success-subtle)_5px,var(--color-success-subtle)_10px)]" />
          </>
        )}
      </div>
      {!caught && (
        <div className="mt-6 text-muted-foreground text-xs leading-snug">
          Live tail covers <strong>{offStr(bridge.totalLag)}</strong> not yet in Iceberg at query time —{' '}
          <PendingStat count={bridge.translationLag} label="pending translation" /> +{' '}
          <PendingStat count={bridge.commitLag} label="pending commit" />. Bridging serves them from the topic so
          results stay realtime.
        </div>
      )}
    </div>
  );
}

function cellText(v: CellValue): string {
  return v === null || v === undefined ? '' : String(v);
}

// Cells are clamped to this width; values long enough to truncate at it
// (~45 mono-xs chars) open the full value in a popover on click.
const CELL_MAX_W = 'max-w-80';
const CELL_CLAMP_CHARS = 45;

function CellContent({ v, kind }: { v: CellValue; kind: ColumnKind }) {
  if (kind === 'bool' && typeof v === 'boolean') {
    return <span className={cn('font-semibold', v ? 'text-success' : 'text-warning')}>{String(v)}</span>;
  }
  if (v === null || v === undefined) {
    return <span className="text-disabled italic">NULL</span>;
  }
  const s = String(v);
  if (s.length <= CELL_CLAMP_CHARS) {
    return <span className={cn('block truncate', CELL_MAX_W)}>{s}</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'block cursor-pointer truncate text-left underline decoration-dotted underline-offset-2',
            CELL_MAX_W
          )}
          title="Show full value"
          type="button"
        >
          {s}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 max-w-120 overflow-auto p-3">
        <Text className="whitespace-pre-wrap break-all font-mono text-xs">{s}</Text>
      </PopoverContent>
    </Popover>
  );
}

function exportData(fmt: 'csv' | 'json', cols: ColumnDef[], rows: ResultRow[]) {
  let blob: Blob;
  if (fmt === 'json') {
    blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  } else {
    const head = cols.map((c) => c.name).join(',');
    const body = rows
      .map((r) =>
        cols
          .map((c) => {
            const s = cellText(r[c.name]);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(',')
      )
      .join('\n');
    blob = new Blob([`${head}\n${body}`], { type: 'text/csv' });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `query_result.${fmt}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Stable grid keys: rows are stable object references from the run, so a
// WeakMap gives each a consistent id for rowKeyGetter without an index key.
function buildRowKeys(rows: ResultRow[]): WeakMap<ResultRow, number> {
  const map = new WeakMap<ResultRow, number>();
  rows.forEach((r, i) => map.set(r, i));
  return map;
}

// Key for the synthetic row-number column; double underscores avoid
// colliding with a real result column of the same name.
const ROWNUM_KEY = '__rownum__';

function buildColumns(cols: ColumnDef[]): Column<ResultRow>[] {
  const rowNum: Column<ResultRow> = {
    key: ROWNUM_KEY,
    name: '',
    frozen: true,
    resizable: false,
    width: 'max-content',
    renderHeaderCell: () => <span className="font-mono text-disabled text-xs">#</span>,
    renderCell: ({ rowIdx }) => rowIdx + 1,
    cellClass: 'text-right font-mono text-disabled text-xs [user-select:none]',
  };
  const dataCols = cols.map((c): Column<ResultRow> => {
    const alignRight = c.kind === 'num';
    return {
      key: c.name,
      name: c.name,
      // At least content-sized; spare panel width is shared between columns
      // so the grid always fills horizontally.
      width: 'minmax(max-content, 1fr)',
      minWidth: 96,
      renderHeaderCell: () => (
        <span
          className={cn(
            'flex h-full flex-col justify-center gap-[3px] font-sans leading-none',
            alignRight ? 'items-end' : 'items-start'
          )}
        >
          <span className="font-mono font-semibold text-strong text-xs">{c.name}</span>
          <span className="inline-flex items-center gap-1 font-normal text-caption-sm text-muted-foreground uppercase tracking-wide">
            <TypeIcon isArray={c.isArray} kind={c.kind} /> {c.short}
          </span>
        </span>
      ),
      renderCell: ({ row }) => <CellContent kind={c.kind} v={row[c.name]} />,
      cellClass: cn('font-mono text-xs', alignRight && 'text-right'),
      headerCellClass: alignRight ? 'text-right' : undefined,
    };
  });
  return [rowNum, ...dataCols];
}

// Keyed by run.token from SqlResults, so a new run resets the grid's internal
// state (scroll position, resized column widths) by remounting. Rows render
// in server order; ordering is the query's job (ORDER BY), not the grid's.
function SuccessGrid({ run }: { run: QueryRunSuccess }) {
  const cols = run.columns;
  const bridge = run.bridge;

  const columns = buildColumns(cols);
  const rowKeys = buildRowKeys(run.rows);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-4 border-border border-b bg-card px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {bridge ? (
            <BridgeBar bridge={bridge} />
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
          {run.truncated && (
            <Badge
              className="rounded-full uppercase tracking-wide"
              size="sm"
              title="The server row cap fired; not all rows were returned."
              variant="warning-inverted"
            >
              truncated
            </Badge>
          )}
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

      {bridge && <BridgeTimeline bridge={bridge} />}

      {/* Virtualized grid: rdg renders only visible rows, so the full result
          set is handed over with no client-side pagination. */}
      <DataGrid
        className="sql-results-grid"
        columns={columns}
        headerRowHeight={52}
        rowClass={(_, i) => (i % 2 === 1 ? 'sql-results-row-alt' : undefined)}
        rowHeight={30}
        rowKeyGetter={(r) => rowKeys.get(r) ?? -1}
        rows={run.rows}
      />
    </div>
  );
}

export function SqlResults({ run, role, onAddTable }: SqlResultsProps) {
  if (run.state === 'idle') {
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
              <Kbd size="xs">⌘</Kbd>
              <Kbd size="xs">↵</Kbd>
            </KbdGroup>{' '}
            or hit Run.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (run.state === 'running') {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner className="size-6 text-action-primary" />
          </EmptyMedia>
          <EmptyTitle>Running query…</EmptyTitle>
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
        {run.hint && (
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            {run.hint}
            {run.hintAction && role === 'admin' && (
              <Button onClick={onAddTable} size="sm" variant="primary">
                <Plus size={14} /> Add a topic to SQL
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return <SuccessGrid key={run.token} run={run} />;
}
