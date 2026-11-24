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

import type { Catalog } from './sql-types';

const LEADING_COMMENTS = /^(?:\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/|\()*/u;
const FIRST_KEYWORD_RE = /^[A-Za-z_][A-Za-z0-9_]*/u;

/** First meaningful keyword of a statement (used to gate which statements run). */
export function firstKeyword(stmt: string) {
  const word = stmt.replace(LEADING_COMMENTS, '').match(FIRST_KEYWORD_RE);
  return word ? word[0].toUpperCase() : '';
}

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

/**
 * This is a UI guard for writes and access-changing statements, not authorization. The SQL service makes the actual execution decision.
 */
export function isWriteKeyword(stmt: string) {
  return WRITE_KEYWORDS.has(firstKeyword(stmt));
}

/** Error copy for a statement the editor refuses to run. */
export function blockedStatementError(keyword: string) {
  if (keyword === 'REVOKE') {
    return { title: 'Manage access in Security', message: 'Grants are managed in Security in this release.' };
  }
  return {
    title: 'Statement not allowed',
    message: `Only read queries are supported in this release. Found "${keyword || 'empty statement'}".`,
  };
}

const CATALOG_CHANGING_KEYWORDS = new Set(['CREATE', 'DROP', 'ALTER', 'RENAME']);

export function isCatalogChangingKeyword(stmt: string) {
  return CATALOG_CHANGING_KEYWORDS.has(firstKeyword(stmt));
}

const SQL_NOISE_RE = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/gu;

const BRIDGE_REF_RE = /(?<catalog>[A-Za-z_][\w$]*)\s*=>\s*"?(?<bridgeName>[a-zA-Z0-9._-]+)/gu;

function singleCatalogTableRef(stmt: string) {
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

function topicForCatalogTable(catalog: Catalog, tableName: string) {
  for (const namespace of catalog.namespaces) {
    const table = namespace.tables.find((t) => t.name === tableName || `${t.namespaceName}.${t.name}` === tableName);
    if (table) {
      return table.topicName ?? table.name;
    }
  }
  return tableName;
}

/**
 * The bridge indicator is meaningful only for a single Redpanda catalog table reference. Ignore explicitly quoted strings and comments when looking for catalog notation; use the table name when the catalog does not include its backing topic.
 */
export function bridgeTopicForQuery(stmt: string, catalogs: Catalog[]) {
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
