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
  'ALTER',
  'TRUNCATE',
  'RENAME',
  'COMMENT',
  'REVOKE',
]);

export function isWriteKeyword(stmt: string): boolean {
  return WRITE_KEYWORDS.has(firstKeyword(stmt));
}

// Error copy for a statement the editor refuses to run.
export function blockedStatementError(keyword: string): { title: string; message: string } {
  if (keyword === 'REVOKE') {
    return { title: 'Manage access in Security', message: 'Grants are managed in Security in this release.' };
  }
  return {
    title: 'Statement not allowed',
    message: `Only read queries are supported in this release. Found "${keyword || 'empty statement'}".`,
  };
}

// Statements that can add, remove or rename catalog objects, so the catalog
// tree must be refetched after they succeed.
const CATALOG_CHANGING_KEYWORDS = new Set(['CREATE', 'DROP', 'ALTER', 'RENAME']);

export function isCatalogChangingKeyword(stmt: string): boolean {
  return CATALOG_CHANGING_KEYWORDS.has(firstKeyword(stmt));
}

// Strip line/block comments and single-quoted string literals so `=>` inside
// them isn't mistaken for a catalog reference. Leaves the structural SQL intact.
const SQL_NOISE_RE = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g;

// Oxla addresses catalog tables as `catalog=>table`. A bridge indicator is
// only meaningful for a single Redpanda-catalog table reference.
const BRIDGE_REF_RE = /([A-Za-z_][\w$]*)\s*=>\s*"?([a-zA-Z0-9._-]+)/g;

// The statement's only `catalog=>table` reference, or null when it has none or several.
function singleCatalogTableRef(stmt: string): { catalogName: string; tableName: string } | null {
  const cleaned = stmt.replace(SQL_NOISE_RE, ' ');
  const matches = [...cleaned.matchAll(BRIDGE_REF_RE)];
  if (matches.length !== 1) {
    return null;
  }
  const catalogName = matches[0]?.[1];
  const tableName = matches[0]?.[2];
  if (!(catalogName && tableName)) {
    return null;
  }
  return { catalogName, tableName };
}

// Topic backing `tableName` (bare or `namespace.table`) in the catalog; the
// name itself when the catalog doesn't list the table.
function topicForCatalogTable(catalog: Catalog, tableName: string): string {
  for (const namespace of catalog.namespaces) {
    const table = namespace.tables.find((t) => t.name === tableName || `${t.namespaceName}.${t.name}` === tableName);
    if (table) {
      return table.topicName ?? table.name;
    }
  }
  return tableName;
}

export function bridgeTopicForQuery(stmt: string, catalogs: Catalog[]): string | null {
  const ref = singleCatalogTableRef(stmt);
  if (!ref) {
    return null;
  }
  const catalog = catalogs.find((c) => c.engine === 'redpanda' && c.name === ref.catalogName);
  if (!catalog) {
    return null;
  }
  return topicForCatalogTable(catalog, ref.tableName);
}
