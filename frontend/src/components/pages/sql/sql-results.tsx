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
import DataGrid, { type Column } from 'react-data-grid';
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

export type SqlResultsProps = {
  /** Current run state: idle | running | error | success. */
  run: QueryRun;
  /** Effective role; gates the admin "Add a topic" CTA on CREATE errors. */
  sqlRole: SqlRole;
  /** Admin entry point for the add-topic wizard. */
  onAddTable?: () => void;
  /** Whether the Redpanda catalog has any tables; drives the idle empty state. */
  hasTables?: boolean;
};

const fmtNum = (n: number) => n.toLocaleString('en-US');
const offStr = (n: number) => `${fmtNum(n)} offset${n === 1 ? '' : 's'}`;
const CSV_ESCAPE_RE = /[",\n]/;
const CSV_QUOTE_RE = /"/g;
// Cells starting with these are interpreted as formulas by Excel/Sheets; prefix
// with a single quote to neutralize CSV injection.
const CSV_FORMULA_RE = /^[=+\-@]/;

// Shared inline-stat layout used across the summary bar.
const RES_STAT =
  'inline-flex items-center gap-1.5 text-xs text-foreground [font-variant-numeric:tabular-nums] [&_svg]:text-muted-foreground';

// Bridge-query indicator shown in the summary bar.
function BridgeBar() {
  return (
    <Badge className="rounded-full bg-accent font-semibold text-accent-foreground" size="md" variant="neutral">
      <GitMerge /> Bridge query
    </Badge>
  );
}

function PendingStat({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-success">
      <StatusDot size="xxs" variant="success" /> {fmtNum(count)} {label}
    </span>
  );
}

// Caption explaining how far the live topic tail runs ahead of Iceberg for a
// bridge query. The offset counts are the real metric snapshot captured at
// query time. Renders nothing when Iceberg is fully caught up.
function BridgeTimeline({ bridge }: { bridge: BridgeInfo }) {
  if (bridge.totalLag === 0) {
    return null;
  }
  return (
    <div className="flex-shrink-0 border-border border-b bg-card px-4 pt-3 pb-3.5">
      <div className="text-muted-foreground text-xs leading-snug">
        Bridge query covers <strong>{offStr(bridge.totalLag)}</strong> not yet in Iceberg at query time —{' '}
        <PendingStat count={bridge.translationLag} label="pending translation" /> +{' '}
        <PendingStat count={bridge.commitLag} label="pending commit" />. Bridging serves them from the topic so results
        stay realtime.
      </div>
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
// rdg header row height; also the top inset of the cell-popover clip overlay so
// popovers slide behind the header rather than over it.
const GRID_HEADER_H = 52;

// Pretty-prints a JSON string with 2-space indent, falling back to the raw
// value when it isn't parseable JSON.
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// Cell popovers portal into a clip layer that covers the grid's data area
// (below the sticky header), so they track the anchor cell and slide behind the
// header — staying within the table section instead of floating over the page.
const CellPopoverContainerContext = createContext<HTMLElement | null>(null);

// Track the anchor and clip rather than reposition, so popovers stick to the
// cell and disappear behind the header on scroll instead of pinning in place.
const TRACK_AND_CLIP = { side: 'flip', align: 'none' } as const;

// Rich viewer for JSON/composite cells: a header with the column name + type, a
// copy button and a close affordance, over a syntax-highlighted, formatted body.
function JsonCellPopover({ value, name, typeLabel }: { value: string; name: string; typeLabel: string }) {
  const [open, setOpen] = useState(false);
  const container = useContext(CellPopoverContainerContext);
  const pretty = useMemo(() => prettyJson(value), [value]);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <button
            className={cn(
              'block cursor-pointer truncate text-left font-mono underline decoration-dotted underline-offset-2',
              CELL_MAX_W
            )}
            title="Show JSON"
            type="button"
          >
            {value}
          </button>
        }
      />
      <PopoverContent
        align="start"
        className="pointer-events-auto w-120 max-w-[90vw] overflow-hidden p-0"
        collisionAvoidance={TRACK_AND_CLIP}
        container={container ?? undefined}
      >
        <div className="flex items-center gap-2 border-border border-b bg-muted px-3 py-2">
          <Braces className="shrink-0 text-info" size={14} />
          <span className="truncate font-mono font-semibold text-sm text-strong">{name}</span>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="shrink-0 font-mono text-muted-foreground text-xs uppercase tracking-wide">{typeLabel}</span>
          <span className="flex-1" />
          <CopyButton className="size-7 p-0" content={pretty} size="sm" variant="ghost" />
          <Button aria-label="Close" className="size-7 p-0" onClick={() => setOpen(false)} size="sm" variant="ghost">
            <X size={14} />
          </Button>
        </div>
        <SyncCodeBlock
          allowCopy={false}
          className="!my-0 rounded-none border-0"
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
  const container = useContext(CellPopoverContainerContext);
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
  return (
    <Popover>
      <PopoverTrigger
        render={
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
        }
      />
      <PopoverContent
        align="start"
        className="pointer-events-auto max-h-72 max-w-120 overflow-auto p-3"
        collisionAvoidance={TRACK_AND_CLIP}
        container={container ?? undefined}
      >
        <div className="whitespace-pre-wrap break-all font-mono text-body-sm">{s}</div>
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
            const raw = cellText(r[c.name]);
            const s = CSV_FORMULA_RE.test(raw) ? `'${raw}` : raw;
            return CSV_ESCAPE_RE.test(s) ? `"${s.replace(CSV_QUOTE_RE, '""')}"` : s;
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
  rows.forEach((r, i) => {
    map.set(r, i);
  });
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
    cellClass: 'sql-results-rownum text-right font-mono text-disabled text-xs [user-select:none]',
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
      // Headers stay left-aligned for every kind; only numeric cell values
      // right-align (so digits line up) — keep the column name readable.
      renderHeaderCell: () => (
        <span className="flex h-full flex-col items-start justify-center gap-[3px] font-sans leading-none">
          <span className="font-mono font-semibold text-strong text-xs">{c.name}</span>
          <span className="inline-flex items-center gap-1 font-normal text-2xs text-muted-foreground uppercase tracking-wide">
            {c.short}
          </span>
        </span>
      ),
      renderCell: ({ row }) => <CellContent kind={c.kind} name={c.name} typeLabel={c.short} v={row[c.name]} />,
      cellClass: cn('font-mono text-xs', alignRight && 'text-right'),
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

  // Stable references across re-renders (e.g. when the bridge lag query resolves
  // and the workspace hands down a new `run` object with the same rows/columns),
  // so DataGrid keeps user column widths and scroll position.
  const columns = useMemo(() => buildColumns(cols), [cols]);
  const rowKeys = useMemo(() => buildRowKeys(run.rows), [run.rows]);

  // Overlay covering the grid's data area (below the sticky header) that cell
  // popovers portal into; its `overflow-hidden` clips them to the table section
  // and behind the header as the anchor row scrolls.
  const [clipEl, setClipEl] = useState<HTMLElement | null>(null);

  return (
    <CellPopoverContainerContext.Provider value={clipEl}>
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="flex flex-shrink-0 items-center gap-4 border-border border-b bg-card px-4 py-2">
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
                className="rounded-full uppercase tracking-wide"
                size="sm"
                title="The server row cap fired; not all rows were returned."
                variant="warning-inverted"
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

export function SqlResults({ run, sqlRole, onAddTable, hasTables = true }: SqlResultsProps) {
  if (run.state === 'idle') {
    // No tables in the catalog yet: nothing to query, so prompt the caller to
    // create one from a topic. Admins get the wizard CTA; viewers get told who can.
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
        {run.hint ? (
          <Alert icon={<Lightbulb />} variant="info">
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
