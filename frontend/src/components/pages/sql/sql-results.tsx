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

type SortState = { col: string | null; dir: 'asc' | 'desc' | null };

const PAGE_SIZE = 100;

const fmtNum = (n: number) => n.toLocaleString('en-US');
const offStr = (n: number) => `${fmtNum(n)} offset${n === 1 ? '' : 's'}`;

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
      <span className="res-bridge-chip">
        <GitMerge size={15} strokeWidth={1.85} /> Bridge query
      </span>
      {bridge.totalLag > 0 && (
        <span className="res-stat res-stat-dim res-bridge-lag" title="Iceberg lag at query time">
          <Waves size={13} /> Iceberg {offStr(bridge.totalLag)} behind{' '}
          <span className="res-bridge-att">at query time</span>
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
    <div className="res-bridge-tl">
      <div className="res-bridge-tl-labels">
        <span>
          <Box size={12} /> Iceberg history
        </span>
        {!caught && (
          <span className="live">
            <Activity size={12} /> Live topic tail
          </span>
        )}
      </div>
      <div className="res-bridge-tl-track" data-caught={caught || undefined}>
        <div className="res-bridge-tl-ice" style={{ width: caught ? '100%' : '74%' }} />
        {!caught && (
          <>
            <div className="res-bridge-tl-seam">
              <span className="res-bridge-tl-flag">watermark · {offStr(bridge.totalLag)}</span>
            </div>
            <div className="res-bridge-tl-live" style={{ width: '26%' }} />
          </>
        )}
      </div>
      {!caught && (
        <div className="res-bridge-tl-cap">
          Live tail covers <strong>{offStr(bridge.totalLag)}</strong> not yet in Iceberg at query time —{' '}
          <span className="res-bridge-stage stage-x">{fmtNum(bridge.translationLag)} pending translation</span> +{' '}
          <span className="res-bridge-stage stage-c">{fmtNum(bridge.commitLag)} pending commit</span>. Bridging serves them
          from the topic so results stay realtime.
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
    <div className="res">
      <div className="res-bar" data-bridge={bridge ? '1' : undefined}>
        <div className="res-bar-left">
          {bridge ? (
            <BridgeBar bridge={bridge} />
          ) : (
            <span className="res-stat ok">
              <span className="res-dot" /> Success
            </span>
          )}
          <span className="res-stat">
            <Rows3 size={14} /> {fmtNum(run.totalRows)} rows
          </span>
          <span className="res-stat">
            <Clock size={14} /> {run.elapsedMs} ms
          </span>
          {run.truncated && (
            <span className="res-truncated" title="The server row cap fired; not all rows were returned.">
              truncated
            </span>
          )}
        </div>
        <div className="res-bar-right">
          <Button onClick={() => exportData('csv', cols, sorted)} size="xs" variant="ghost">
            <Download size={13} /> CSV
          </Button>
          <Button onClick={() => exportData('json', cols, sorted)} size="xs" variant="ghost">
            <Download size={13} /> JSON
          </Button>
        </div>
      </div>

      {bridge && <BridgeTimeline bridge={bridge} />}

      <div className="res-grid-wrap">
        <table className="res-grid">
          <thead>
            <tr>
              <th className="res-rownum">#</th>
              {cols.map((c) => {
                const ds = sort.col === c.name ? (sort.dir ?? 'none') : 'none';
                return (
                  <th data-align={c.kind === 'num' ? 'right' : undefined} key={c.name}>
                    <button className="res-th" data-sort={ds} onClick={() => cycleSort(c.name)} type="button">
                      <span className="res-th-top">
                        <span className="res-th-name">{c.name}</span>
                        <span className="res-th-sort">
                          {ds === 'asc' ? (
                            <ArrowUp size={13} />
                          ) : ds === 'desc' ? (
                            <ArrowDown size={13} />
                          ) : (
                            <ChevronsUpDown size={13} />
                          )}
                        </span>
                      </span>
                      <span className="res-th-type">
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
              <tr key={rowKeys.get(r) ?? i}>
                <td className="res-rownum">{i + 1}</td>
                {cols.map((c) => {
                  const v = r[c.name];
                  return (
                    <td className={c.kind === 'num' ? 'res-num' : undefined} key={c.name}>
                      {c.kind === 'bool' && typeof v === 'boolean' ? (
                        <span className={`res-bool ${v ? 'res-bool-t' : 'res-bool-f'}`}>{String(v)}</span>
                      ) : v === null || v === undefined ? (
                        <span className="res-null">NULL</span>
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

      <div className="res-foot">
        <span className="res-foot-info">
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
      <div className="res-empty">
        <div>
          <div className="res-empty-media">
            <Terminal size={20} />
          </div>
          <div className="res-empty-title">Run a query to see results</div>
          <div className="res-empty-description">
            Write a <code className="inline-code-mini">SELECT</code> against a table in the catalog, then press{' '}
            <span className="res-kbd">⌘</span>
            <span className="res-kbd">↵</span> or hit Run.
          </div>
        </div>
      </div>
    );
  }

  if (run.state === 'running') {
    return (
      <div className="res-empty">
        <div>
          <div className="res-empty-media">
            <Loader2 className="res-spinner" size={22} />
          </div>
          <div className="res-empty-title">Running query…</div>
        </div>
      </div>
    );
  }

  if (run.state === 'error') {
    return (
      <div className="res-status">
        <div className="res-alert" data-variant="destructive">
          <CircleX size={18} />
          <div>
            <div className="res-alert-title">{run.title}</div>
            <div className="res-alert-description">{run.message}</div>
          </div>
        </div>
        {run.hint && (
          <div className="res-status-hint">
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
