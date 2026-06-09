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

import { Button } from 'components/redpanda-ui/components/button';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Box,
  Calendar,
  ChevronsUpDown,
  CircleX,
  Clock,
  Download,
  GitMerge,
  Hash,
  Loader2,
  Plus,
  Rows3,
  Terminal,
  ToggleLeft,
  Type,
  Waves,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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

type SortState = { col: string | null; dir: 'asc' | 'desc' | null };

const PAGE_SIZE = 100;

const fmtNum = (n: number) => n.toLocaleString('en-US');
const offStr = (n: number) => `${fmtNum(n)} offset${n === 1 ? '' : 's'}`;

// .res-stat: shared inline-stat layout used across the summary bar.
const RES_STAT =
  'inline-flex items-center gap-1.5 text-[12.5px] text-foreground [font-variant-numeric:tabular-nums] [&_svg]:text-muted-foreground';

function TypeIcon({ kind, size = 11 }: { kind: ColumnKind; size?: number }) {
  switch (kind) {
    case 'num':
      return <Hash size={size} />;
    case 'bool':
      return <ToggleLeft size={size} />;
    case 'time':
      return <Calendar size={size} />;
    default:
      return <Type size={size} />;
  }
}

// Inline chip + Iceberg-lag snapshot shown in the summary bar for bridge queries.
function BridgeBar({ bridge }: { bridge: BridgeInfo }) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-2.5 py-[3px] font-semibold text-[12.5px] text-accent-foreground [&_svg]:text-current">
        <GitMerge size={15} strokeWidth={1.85} /> Bridge query
      </span>
      {bridge.totalLag > 0 && (
        <span
          className={cn(RES_STAT, 'whitespace-nowrap font-mono text-[11.5px] text-muted-foreground')}
          title="Iceberg lag at query time"
        >
          <Waves size={13} /> Iceberg {offStr(bridge.totalLag)} behind{' '}
          <span className="ml-[3px] whitespace-nowrap font-normal text-[10.5px] text-disabled not-italic">
            at query time
          </span>
        </span>
      )}
    </>
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
      <div className="mb-[7px] flex justify-between font-semibold text-[11px]">
        <span className="inline-flex items-center gap-[5px] text-blue-700">
          <Box size={12} /> Iceberg history
        </span>
        {!caught && (
          <span className="inline-flex items-center gap-[5px] text-green-700">
            <Activity size={12} /> Live topic tail
          </span>
        )}
      </div>
      <div className="relative flex h-[30px] items-stretch" data-caught={caught || undefined}>
        {/* .res-bridge-tl-ice: the Iceberg segment. When caught up it closes its
            right edge (full radius); otherwise it abuts the live segment. */}
        <div
          className={cn(
            'flex min-w-0 items-center border border-blue-300 border-r-0 bg-blue-alpha-200 px-[11px]',
            caught ? 'rounded-md border-r' : 'rounded-l-md'
          )}
          style={{ width: caught ? '100%' : '74%' }}
        />
        {!caught && (
          <>
            <div className="relative z-[2] w-0 self-stretch border-subtle border-l-2 border-dashed">
              <span className="absolute bottom-[-2px] left-1/2 z-[3] -translate-x-1/2 translate-y-[120%] whitespace-nowrap rounded-full border border-border bg-muted px-[7px] py-px font-bold text-[9.5px] text-foreground uppercase tracking-[0.03em]">
                watermark · {offStr(bridge.totalLag)}
              </span>
            </div>
            {/* .res-bridge-tl-live: live-tail segment with the 45deg hatch overlay. */}
            <div
              className="relative overflow-hidden rounded-r-md border border-green-300 border-l-0 bg-green-100 after:absolute after:inset-0 after:content-[''] after:[background:repeating-linear-gradient(45deg,transparent,transparent_5px,var(--color-green-alpha-300)_5px,var(--color-green-alpha-300)_10px)]"
              style={{ width: '26%' }}
            />
          </>
        )}
      </div>
      {!caught && (
        <div className="mt-6 text-[11.5px] text-muted-foreground leading-[1.4]">
          Live tail covers <strong>{offStr(bridge.totalLag)}</strong> not yet in Iceberg at query time —{' '}
          <span className="whitespace-nowrap font-semibold text-green-700 before:mr-1 before:inline-block before:h-[7px] before:w-[7px] before:rounded-full before:bg-green-500 before:align-baseline before:content-['']">
            {fmtNum(bridge.translationLag)} pending translation
          </span>{' '}
          +{' '}
          <span className="whitespace-nowrap font-semibold text-green-700 before:mr-1 before:inline-block before:h-[7px] before:w-[7px] before:rounded-full before:bg-green-300 before:align-baseline before:content-['']">
            {fmtNum(bridge.commitLag)} pending commit
          </span>
          . Bridging serves them from the topic so results stay realtime.
        </div>
      )}
    </div>
  );
}

function cellText(v: CellValue): string {
  return v === null || v === undefined ? '' : String(v);
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

function SuccessGrid({ run }: { run: QueryRunSuccess }) {
  const [sort, setSort] = useState<SortState>({ col: null, dir: null });
  const [shown, setShown] = useState(PAGE_SIZE);

  // Reset paging/sort when a new run arrives.
  useEffect(() => {
    setSort({ col: null, dir: null });
    setShown(PAGE_SIZE);
  }, [run.token]);

  const cols = run.columns;
  const bridge = run.bridge;

  const sorted = useMemo(() => {
    if (!sort.col) {
      return run.rows;
    }
    const sortCol = sort.col;
    const col = cols.find((c) => c.name === sortCol);
    if (!col) {
      return run.rows;
    }
    const numeric = col.kind === 'num';
    const key = (r: ResultRow): number | string | boolean => {
      const v = r[sortCol];
      if (numeric) {
        return Number.parseFloat(cellText(v));
      }
      return v === null || v === undefined ? '' : v;
    };
    const arr = [...run.rows];
    arr.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x < y) {
        return sort.dir === 'asc' ? -1 : 1;
      }
      if (x > y) {
        return sort.dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return arr;
  }, [sort, run.rows, cols]);

  const visible = sorted.slice(0, shown);

  // Stable React keys: rows are stable object references from the run, so a
  // WeakMap gives each a consistent id across sorts/pagination without an index key.
  const rowKeys = useMemo(() => {
    const map = new WeakMap<ResultRow, number>();
    run.rows.forEach((r, i) => map.set(r, i));
    return map;
  }, [run.rows]);

  const cycleSort = (name: string) => {
    setSort((s) => {
      if (s.col !== name) {
        return { col: name, dir: 'asc' };
      }
      if (s.dir === 'asc') {
        return { col: name, dir: 'desc' };
      }
      return { col: null, dir: null };
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-4 border-border border-b bg-card px-4 py-[9px]">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {bridge ? (
            <BridgeBar bridge={bridge} />
          ) : (
            <span className={cn(RES_STAT, 'font-semibold text-green-700')}>
              <span className="inline-block h-[7px] w-[7px] flex-shrink-0 rounded-full bg-success" /> Success
            </span>
          )}
          <span className={cn(RES_STAT, bridge && 'whitespace-nowrap')}>
            <Rows3 size={14} /> {fmtNum(run.totalRows)} rows
          </span>
          <span className={cn(RES_STAT, bridge && 'whitespace-nowrap')}>
            <Clock size={14} /> {run.elapsedMs} ms
          </span>
          {run.truncated && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-orange-alpha-100 px-[7px] py-0.5 font-semibold text-[10.5px] text-orange-700 uppercase tracking-[0.02em]"
              title="The server row cap fired; not all rows were returned."
            >
              truncated
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button onClick={() => exportData('csv', cols, sorted)} size="xs" variant="ghost">
            <Download size={13} /> CSV
          </Button>
          <Button onClick={() => exportData('json', cols, sorted)} size="xs" variant="ghost">
            <Download size={13} /> JSON
          </Button>
        </div>
      </div>

      {bridge && <BridgeTimeline bridge={bridge} />}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {/* .res-rownum (th): sticky row-number header, above body rownum cells. */}
              <th className="sticky top-0 left-0 z-[3] w-[1%] whitespace-nowrap border-border border-b bg-muted px-4 py-2 text-right align-bottom font-mono text-[11px] text-disabled [user-select:none]">
                #
              </th>
              {cols.map((c) => {
                const ds = sort.col === c.name ? (sort.dir ?? 'none') : 'none';
                const alignRight = c.kind === 'num';
                return (
                  <th
                    className="sticky top-0 z-[2] border-border border-b bg-muted px-4 py-2 text-left align-bottom"
                    data-align={alignRight ? 'right' : undefined}
                    key={c.name}
                  >
                    <button
                      className={cn(
                        'flex w-full cursor-pointer flex-col gap-[3px] border-0 bg-transparent p-0 font-[inherit]',
                        alignRight ? 'items-end' : 'items-start'
                      )}
                      data-sort={ds}
                      onClick={() => cycleSort(c.name)}
                      type="button"
                    >
                      <span className={cn('flex items-center gap-1.5', alignRight && 'flex-row-reverse')}>
                        <span className="font-mono font-semibold text-[12.5px] text-strong">{c.name}</span>
                        <span
                          className={cn(
                            'inline-flex h-[13px] w-[13px]',
                            ds === 'asc' || ds === 'desc' ? 'text-action-primary' : 'text-disabled'
                          )}
                        >
                          {ds === 'asc' ? (
                            <ArrowUp size={13} />
                          ) : ds === 'desc' ? (
                            <ArrowDown size={13} />
                          ) : (
                            <ChevronsUpDown size={13} />
                          )}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-[0.02em]">
                        <TypeIcon kind={c.kind} /> {c.short}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                className={cn(
                  // Zebra stripe: plain card surface with a faint subtle-bg
                  // stripe on alternate rows. The header is a distinct shade
                  // (lighter grey in dark) so the first row never blends into it.
                  i % 2 === 1 ? 'bg-background-subtle' : 'bg-card',
                  'hover:bg-accent-subtle'
                )}
                key={rowKeys.get(r) ?? i}
              >
                {/* .res-rownum (td): sticky row-number column; inherits the row
                    surface so the stripe carries across and occludes scroll. */}
                <td className="sticky left-0 w-[1%] whitespace-nowrap border-border-subtle border-b bg-inherit px-4 py-[7px] text-right font-mono text-[11px] text-disabled [user-select:none]">
                  {i + 1}
                </td>
                {cols.map((c) => {
                  const v = r[c.name];
                  return (
                    <td
                      className={cn(
                        'whitespace-nowrap border-border-subtle border-b px-4 py-[7px] font-mono text-[12.5px] text-foreground',
                        c.kind === 'num' && 'text-right'
                      )}
                      key={c.name}
                    >
                      {c.kind === 'bool' && typeof v === 'boolean' ? (
                        <span className={cn('font-semibold', v ? 'text-green-700' : 'text-orange-700')}>
                          {String(v)}
                        </span>
                      ) : v === null || v === undefined ? (
                        <span className="text-disabled italic">NULL</span>
                      ) : (
                        String(v)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-shrink-0 items-center justify-between border-border border-t bg-card px-4 py-2">
        <span className="text-[12px] text-muted-foreground [font-variant-numeric:tabular-nums]">
          Showing {fmtNum(visible.length)} of {fmtNum(run.totalRows)} rows
        </span>
        {shown < sorted.length && (
          <Button onClick={() => setShown((s) => s + PAGE_SIZE)} size="xs" variant="secondary-outline">
            Load 100 more
          </Button>
        )}
      </div>
    </div>
  );
}

export function SqlResults({ run, role, onAddTable }: SqlResultsProps) {
  if (run.state === 'idle') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center p-6 text-center">
        <div>
          <div className="mx-auto mb-3 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Terminal size={20} />
          </div>
          <div className="mb-1.5 font-semibold text-[14px] text-strong">Run a query to see results</div>
          <div className="mx-auto max-w-[420px] text-[13px] text-muted-foreground leading-[1.5]">
            Write a <code className="rounded bg-muted px-[5px] py-px font-mono">SELECT</code> against a table in the
            catalog, then press{' '}
            <span className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-card px-1 font-mono text-[11px] text-strong">
              ⌘
            </span>
            <span className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-card px-1 font-mono text-[11px] text-strong">
              ↵
            </span>{' '}
            or hit Run.
          </div>
        </div>
      </div>
    );
  }

  if (run.state === 'running') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center p-6 text-center">
        <div>
          <div className="mx-auto mb-3 flex h-[44px] w-[44px] items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Loader2 className="h-[22px] w-[22px] animate-spin text-action-primary" size={22} />
          </div>
          <div className="mb-1.5 font-semibold text-[14px] text-strong">Running query…</div>
        </div>
      </div>
    );
  }

  if (run.state === 'error') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-3.5 overflow-y-auto p-[22px]">
        {/* .res-alert[data-variant='destructive']: orange-bordered error card. */}
        <div
          className="flex items-start gap-2.5 rounded-md border border-orange-700 bg-card px-3.5 py-3 text-orange-700 [&_svg]:text-orange-700"
          data-variant="destructive"
        >
          <CircleX size={18} />
          <div>
            <div className="font-semibold text-[13px] text-strong">{run.title}</div>
            <div className="mt-0.5 text-[12.5px] text-muted-foreground leading-[1.45]">{run.message}</div>
          </div>
        </div>
        {run.hint && (
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
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

  return <SuccessGrid run={run} />;
}
