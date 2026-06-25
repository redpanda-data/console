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

import { ConnectError } from '@connectrpc/connect';
import { ErrorInfoSchema } from 'protogen/google/rpc/error_details_pb';

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

// Logical kind derived from the Postgres type name, used for alignment and
// cell rendering.
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
const ARRAY_WRAPPER_RE = /^(?:ARRAY|LIST)\s*<(.+)>$/i;

export function arrayElementPgType(pgType: string): string | null {
  const t = pgType.trim();
  if (t.endsWith('[]')) {
    return t.slice(0, -2);
  }
  if (t.startsWith('_')) {
    return t.slice(1);
  }
  const wrapped = ARRAY_WRAPPER_RE.exec(t);
  return wrapped ? wrapped[1] : null;
}

export function isArrayPgType(pgType: string): boolean {
  return arrayElementPgType(pgType) !== null;
}

// Maps a Postgres type name to a display kind. Composite columns arrive as the
// literal "record"/"record[]" (the backend parses structure into Column.fields)
// and render with the JSON tree viewer. Arrays map to their element kind;
// anything unrecognized defaults to a string.
export function columnKindForPgType(pgType: string): ColumnKind {
  const element = arrayElementPgType(pgType);
  if (element !== null) {
    return columnKindForPgType(element);
  }
  const t = pgType.toUpperCase();
  // Temporal first: INTERVAL would otherwise match the INT substring in NUMERIC.
  if (TEMPORAL_TYPE.test(t)) {
    return 'time';
  }
  if (NUMERIC_TYPE.test(t)) {
    return 'num';
  }
  if (BOOL_TYPE.test(t)) {
    return 'bool';
  }
  // RECORD/RECORD[] are composite columns; JSON kept for any real json scalar.
  if (t.includes('RECORD') || t.includes('JSON')) {
    return 'json';
  }
  return 'str';
}

// The backend appends an actionable hint after a blank line ("\n\nHint: …");
// split it off so it can render on its own line instead of inline in the message.
export function splitQueryError(message: string): { message: string; hint?: string } {
  const sep = '\n\nHint: ';
  const i = message.indexOf(sep);
  return i === -1 ? { message } : { message: message.slice(0, i), hint: message.slice(i + sep.length) };
}

// Structured hint from the Connect error's ErrorInfo metadata. Preferred over the
// message-string fallback in splitQueryError — same text, but read from a typed
// detail instead of parsed out of prose. undefined when absent.
export function hintFromError(error: unknown): string | undefined {
  if (error instanceof ConnectError) {
    for (const info of error.findDetails(ErrorInfoSchema)) {
      if (info.metadata.hint) {
        return info.metadata.hint;
      }
    }
  }
  return;
}

// Word-boundary anchored so geometric/temporal names that merely contain a
// numeric token (POINT → INT, INTERVAL → INT) don't get misread as numeric.
const NUMERIC_TYPE = /\b(?:INT|INTEGER|SMALLINT|BIGINT|FLOAT|NUMERIC|DECIMAL|DOUBLE|REAL|SERIAL|MONEY)/;
const BOOL_TYPE = /BOOL/;
const TEMPORAL_TYPE = /(TIMESTAMP|DATE|TIME|INTERVAL)/;
