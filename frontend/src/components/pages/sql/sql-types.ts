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

// Shared types for the SQL workspace. UI-facing view models are derived from the
// generated proto messages where possible so the leaf components and the data
// layer agree on shape.

import type {
  Catalog as ProtoCatalog,
  Column as ProtoColumn,
  Table as ProtoTable,
} from 'protogen/redpanda/api/dataplane/v1alpha3/sql_pb';

// Re-export the proto messages under the names the children import.
export type { ProtoCatalog, ProtoTable, ProtoColumn };

// A catalog as displayed in the tree. `displayLabel` is the human label
// (e.g. "Redpanda Catalog") while `name` is the SQL identifier used in queries
// (e.g. "default_redpanda_catalog").
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

// A namespace groups tables within a catalog.
export type Namespace = {
  name: string;
  /** Stable id used for expand/collapse + pagination state. */
  id: string;
  tables: TableRef[];
};

// A table reference as displayed in the tree.
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
export type ColumnKind = 'num' | 'str' | 'bool' | 'time';

export type ColumnDef = {
  name: string;
  /** Raw Postgres type name as reported by the driver (e.g. "INT8", "TEXT"). */
  type: string;
  /** Derived display kind. */
  kind: ColumnKind;
  /** Short label shown under the column name (e.g. "int", "text"). */
  short: string;
};

// A single result cell. `null` is SQL NULL; everything else is the raw string
// (or coerced boolean) for display.
export type CellValue = string | boolean | null;

// A result row keyed by column name (matches the prototype's grid model).
export type ResultRow = Record<string, CellValue>;

// Iceberg-lag snapshot for a bridge query. Offset-based, captured at query time.
export type BridgeInfo = {
  topic: string;
  translationLag: number;
  commitLag: number;
  totalLag: number;
};

// Discriminated union describing the lifecycle of a single query run.
export type QueryRunIdle = { state: 'idle' };
export type QueryRunRunning = { state: 'running'; token: number };
export type QueryRunError = {
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

// The caller's effective role in the workspace. Drives admin-only affordances.
export type SqlRole = 'admin' | 'viewer';

// Autocomplete identifier surfaced to the editor.
export type SqlIdentifier = {
  label: string;
  kind: 'catalog' | 'table' | 'column' | 'keyword';
};

// Maps a Postgres type name to a display kind. Conservative defaults: anything
// unrecognized is treated as a string.
export function columnKindForPgType(pgType: string): ColumnKind {
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
  return 'str';
}

// Short, lower-case label for a Postgres type name (best-effort).
export function shortPgType(pgType: string): string {
  return pgType.toLowerCase();
}
