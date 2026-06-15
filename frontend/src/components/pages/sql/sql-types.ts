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

// Shared types for the SQL workspace, so the leaf components (catalog tree,
// editor, results) and the data layer in sql-workspace agree on shape without
// importing from each other.

export type Catalog = {
  /** SQL identifier, e.g. `default_redpanda_catalog`. */
  name: string;
  /** Human-friendly label shown in the tree. */
  displayLabel: string;
  /** Backing engine — drives the glyph/color in the tree. */
  engine: CatalogEngine;
  namespaces: Namespace[];
};

export type CatalogEngine = 'redpanda' | 'iceberg';

export type Namespace = {
  name: string;
  /** Stable id used for expand/collapse + pagination state. */
  id: string;
  tables: TableRef[];
};

export type TableRef = {
  /** Stable id, typically `<catalog>.<namespace>.<name>`. */
  id: string;
  name: string;
  namespaceName: string;
  catalogName: string;
  /** Backing Kafka topic, when the table is topic-backed. */
  topicName?: string;
  /** True when this Redpanda-catalog table is also Iceberg-tiered (bridge query). */
  tiered?: boolean;
  /** True when the catalog engine is Iceberg (dedicated Iceberg table). */
  iceberg?: boolean;
  /** False when the caller lacks a SELECT grant — rendered locked/disabled. */
  allowed?: boolean;
  /** Columns from DescribeTable; undefined until the table is expanded/fetched. */
  columns?: ColumnDef[];
};

// Logical kind derived from the Postgres type name, used for icons, alignment,
// sorting and cell rendering.
export type ColumnKind = 'num' | 'str' | 'bool' | 'time' | 'json';

export type ColumnDef = {
  name: string;
  /** Raw Postgres type name as reported by the driver (e.g. "INT8", "TEXT"). */
  type: string;
  /** Derived display kind. For arrays this is the element kind. */
  kind: ColumnKind;
  /** Short label shown under the column name — the type name lower-cased. */
  short: string;
  /** True for array types (e.g. "TEXT[]", "_INT4", "ARRAY<STRING>"). */
  isArray?: boolean;
};

// A single result cell. `null` is SQL NULL; everything else is the raw string
// (or coerced boolean) for display.
export type CellValue = string | boolean | null;

// A result row keyed by column name.
export type ResultRow = Record<string, CellValue>;

// Iceberg-lag snapshot for a bridge query. Offset-based, captured at query time.
export type BridgeInfo = {
  topic: string;
  translationLag: number;
  commitLag: number;
  totalLag: number;
};

type QueryRunIdle = { state: 'idle' };
type QueryRunRunning = { state: 'running'; token: number };
type QueryRunError = {
  state: 'error';
  token: number;
  title: string;
  message: string;
  /** Optional follow-up hint line (e.g. for CREATE → wizard). */
  hint?: string;
  /** When true and the caller is an admin, render the "Add a topic" CTA. */
  hintAction?: boolean;
};
export type QueryRunSuccess = {
  state: 'success';
  token: number;
  columns: ColumnDef[];
  rows: ResultRow[];
  totalRows: number;
  elapsedMs: number;
  /** True when the server row cap fired. */
  truncated: boolean;
  /** Present only for bridge (Iceberg-tiered) queries. */
  bridge?: BridgeInfo;
};

export type QueryRun = QueryRunIdle | QueryRunRunning | QueryRunError | QueryRunSuccess;

// Drives admin-only affordances (e.g. the "Add a topic" CTA).
export type SqlRole = 'admin' | 'viewer';

// Unwraps one level of array syntax — "TEXT[]", "_TEXT" (pg wire naming), or
// "ARRAY<TEXT>"/"LIST<TEXT>" (Iceberg) — returning the element type, or null
// when the type is not an array.
export function arrayElementPgType(pgType: string): string | null {
  const t = pgType.trim();
  if (t.endsWith('[]')) {
    return t.slice(0, -2);
  }
  if (t.startsWith('_')) {
    return t.slice(1);
  }
  const wrapped = /^(?:ARRAY|LIST)\s*<(.+)>$/i.exec(t);
  return wrapped ? wrapped[1] : null;
}

export function isArrayPgType(pgType: string): boolean {
  return arrayElementPgType(pgType) !== null;
}

// Maps a Postgres type name to a display kind. Arrays map to their element
// kind. Conservative defaults: anything unrecognized is treated as a string.
export function columnKindForPgType(pgType: string): ColumnKind {
  const element = arrayElementPgType(pgType);
  if (element !== null) {
    return columnKindForPgType(element);
  }
  const t = pgType.toUpperCase();
  if (/(INT|FLOAT|NUMERIC|DECIMAL|DOUBLE|REAL|SERIAL|MONEY)/.test(t)) {
    return 'num';
  }
  if (/BOOL/.test(t)) {
    return 'bool';
  }
  if (/(TIMESTAMP|DATE|TIME|INTERVAL)/.test(t)) {
    return 'time';
  }
  if (t.includes('JSON')) {
    return 'json';
  }
  return 'str';
}
