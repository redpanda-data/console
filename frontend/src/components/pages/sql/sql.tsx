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

// SQL helpers for the query workspace. Highlighting (editor: CodeMirror's
// Lezer SQL grammar, wizard preview: shiki via DynamicCodeBlock), keyword
// completion (lang-sql's PostgreSQL dialect) and formatting (sql-formatter)
// are handled by the libraries directly.

import type { Catalog } from './sql-types';

// Redpanda SQL (Oxla) addresses catalog-qualified tables with the `=>`
// operator, e.g. `default_redpanda_catalog=>cars` — not `catalog.table`. This
// preview shape is shared by the editor's catalog tree and the landing page's
// table/suggested-query CTAs so the two can't drift.
export function previewSql(catalogName: string, tableName: string): string {
  return `SELECT *\nFROM ${catalogName}=>${tableName}\nLIMIT 100;`;
}

// Leading whitespace, line/block comments, and opening parens — so a query
// wrapped like `(SELECT …)` still resolves to its first keyword.
const LEADING_COMMENTS = /^(?:\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/|\()*/;
const FIRST_KEYWORD_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

// First meaningful keyword of a statement (used to gate which statements run).
export function firstKeyword(stmt: string): string {
  const word = stmt.replace(LEADING_COMMENTS, '').match(FIRST_KEYWORD_RE);
  return word ? word[0].toUpperCase() : '';
}

// Statements that mutate state or manage access. These are blocked in the
// editor in this release — the server is the authority on what can run; this is
// a UX guard rail, not a security control. Everything else (SELECT, WITH/CTE,
// EXPLAIN, SHOW, …) is read-shaped and allowed through.
const WRITE_KEYWORDS = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'MERGE',
  'UPSERT',
  'REPLACE',
  'CREATE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'RENAME',
  'COMMENT',
  'GRANT',
  'REVOKE',
]);

export function isWriteKeyword(stmt: string): boolean {
  return WRITE_KEYWORDS.has(firstKeyword(stmt));
}

// Strip line/block comments and single-quoted string literals so `=>` inside
// them isn't mistaken for a catalog reference. Leaves the structural SQL intact.
const SQL_NOISE_RE = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g;

// Oxla addresses catalog tables as `catalog=>table`. A bridge indicator is
// only meaningful for a single Redpanda-catalog table reference.
const BRIDGE_REF_RE = /([A-Za-z_][\w$]*)\s*=>\s*"?([a-zA-Z0-9._-]+)/g;

export function bridgeTopicForQuery(stmt: string, catalogs: Catalog[]): string | null {
  const cleaned = stmt.replace(SQL_NOISE_RE, ' ');
  const matches = [...cleaned.matchAll(BRIDGE_REF_RE)];
  if (matches.length !== 1) {
    return null;
  }
  const match = matches[0];
  const catalogName = match?.[1];
  const tableName = match?.[2];
  if (!catalogName) {
    return null;
  }
  if (!tableName) {
    return null;
  }
  const catalog = catalogs.find((c) => c.engine === 'redpanda' && c.name === catalogName);
  if (!catalog) {
    return null;
  }

  for (const namespace of catalog.namespaces) {
    const table = namespace.tables.find((t) => t.name === tableName || `${t.namespaceName}.${t.name}` === tableName);
    if (table) {
      return table.topicName ?? table.name;
    }
  }

  return tableName;
}
