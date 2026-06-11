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

// SQL helpers for the query workspace. Highlighting (editor: Monarch, wizard
// preview: shiki via DynamicCodeBlock) and formatting (sql-formatter via a
// DocumentFormattingEditProvider) are handled by the libraries directly.

import { language as monacoSql } from 'monaco-editor/esm/vs/basic-languages/sql/sql';

// Autocomplete vocabulary, from Monaco's built-in SQL Monarch definition — the
// same list the editor highlights. Broader than what Oxla accepts; unsupported
// statements fail server-side with a query error.
export const SQL_KEYWORDS: readonly string[] = monacoSql.keywords;

const LEADING_COMMENTS = /^(?:\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/)*/;

// First meaningful keyword of a statement (used to gate to SELECT-only).
export function firstKeyword(stmt: string): string {
  const word = stmt.replace(LEADING_COMMENTS, '').match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return word ? word[0].toUpperCase() : '';
}
