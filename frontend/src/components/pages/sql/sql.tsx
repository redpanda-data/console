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

const LEADING_COMMENTS = /^(?:\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/)*/;

// First meaningful keyword of a statement (used to gate to SELECT-only).
export function firstKeyword(stmt: string): string {
  const word = stmt.replace(LEADING_COMMENTS, '').match(/^[A-Za-z_][A-Za-z0-9_]*/);
  return word ? word[0].toUpperCase() : '';
}
