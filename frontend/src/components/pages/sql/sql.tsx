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

// Typed port of the design prototype `sql.jsx`: a tiny SQL tokenizer used for
// syntax highlighting, a pretty-formatter, and a first-keyword detector.

export const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'NULL',
  'AS',
  'ON',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'GROUP',
  'BY',
  'ORDER',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'DISTINCT',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'IN',
  'LIKE',
  'BETWEEN',
  'IS',
  'ASC',
  'DESC',
  'UNION',
  'ALL',
  'WITH',
  'CREATE',
  'TABLE',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'GRANT',
  'REVOKE',
  'TO',
  'DROP',
  'ALTER',
  'INTERVAL',
  'EXTRACT',
  'DATE',
  'TIMESTAMP',
  'CAST',
  'OVER',
  'PARTITION',
  'DESCRIBE',
  'SHOW',
] as const;

export const SQL_FUNCS = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'now',
  'date_trunc',
  'lower',
  'upper',
  'coalesce',
  'round',
  'cast',
  'extract',
] as const;

const KW_SET = new Set<string>(SQL_KEYWORDS.map((k) => k.toUpperCase()));
const FN_SET = new Set<string>(SQL_FUNCS);

export type SqlTokenType = 'kw' | 'fn' | 'id' | 'str' | 'num' | 'cm' | 'ws' | 'pn';

export type SqlToken = {
  type: SqlTokenType;
  value: string;
};

const WS = /\s/;
const DIGIT = /[0-9]/;
const NUM_BODY = /[0-9._]/;
const WORD_START = /[A-Za-z_]/;
const WORD_BODY = /[A-Za-z0-9_]/;

// Tokenize into tokens preserving all whitespace so the source can be rebuilt verbatim.
export function tokenizeSQL(src: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;
  const n = src.length;
  const push = (type: SqlTokenType, value: string) => tokens.push({ type, value });

  while (i < n) {
    const c = src[i];

    // line comment
    if (c === '-' && src[i + 1] === '-') {
      let j = i;
      while (j < n && src[j] !== '\n') {
        j++;
      }
      push('cm', src.slice(i, j));
      i = j;
      continue;
    }

    // block comment
    if (c === '/' && src[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) {
        j++;
      }
      j = Math.min(n, j + 2);
      push('cm', src.slice(i, j));
      i = j;
      continue;
    }

    // string
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') {
          j++;
        }
        j++;
      }
      j = Math.min(n, j + 1);
      push('str', src.slice(i, j));
      i = j;
      continue;
    }

    // whitespace
    if (WS.test(c)) {
      let j = i;
      while (j < n && WS.test(src[j])) {
        j++;
      }
      push('ws', src.slice(i, j));
      i = j;
      continue;
    }

    // number
    if (DIGIT.test(c)) {
      let j = i;
      while (j < n && NUM_BODY.test(src[j])) {
        j++;
      }
      push('num', src.slice(i, j));
      i = j;
      continue;
    }

    // word
    if (WORD_START.test(c)) {
      let j = i;
      while (j < n && WORD_BODY.test(src[j])) {
        j++;
      }
      const word = src.slice(i, j);
      if (KW_SET.has(word.toUpperCase())) {
        push('kw', word);
      } else if (FN_SET.has(word.toLowerCase()) && src[j] === '(') {
        push('fn', word);
      } else {
        push('id', word);
      }
      i = j;
      continue;
    }

    // punctuation / operators
    push('pn', c);
    i++;
  }

  return tokens;
}

// HTML-escape for the highlight overlay.
export function escHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Build highlighted HTML (used inside the overlay <pre>). Token classes match
// the shared CSS: sql-kw, sql-fn, sql-str, sql-num, sql-cm, sql-id, sql-pn.
export function highlightSQL(src: string): string {
  return tokenizeSQL(src)
    .map((t) => {
      if (t.type === 'ws') {
        return escHTML(t.value);
      }
      return `<span class="sql-${t.type}">${escHTML(t.value)}</span>`;
    })
    .join('');
}

const FORMAT_CLAUSES = [
  'FROM',
  'WHERE',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'JOIN',
  'UNION',
];

// Small pretty-formatter: newline before major clauses, keywords upper-cased.
export function formatSQL(src: string): string {
  const formatted = src
    .split(';')
    .map((stmt) => {
      let s = stmt.replace(/\s+/g, ' ').trim();
      if (!s) {
        return '';
      }
      // upper-case standalone keywords
      s = s.replace(/\b([A-Za-z_]+)\b/g, (m) => (KW_SET.has(m.toUpperCase()) ? m.toUpperCase() : m));
      // line breaks before clauses
      for (const cl of FORMAT_CLAUSES) {
        const re = new RegExp(`\\s+${cl.replace(' ', '\\s+')}\\b`, 'g');
        s = s.replace(re, `\n${cl}`);
      }
      // indent column lists lightly
      s = s.replace(/,\s*/g, ',\n  ');
      return s;
    })
    .filter(Boolean)
    .join(';\n\n');

  return formatted + (src.trim().endsWith(';') ? ';' : '');
}

// First meaningful keyword of a statement (used to detect SELECT vs. others).
export function firstKeyword(stmt: string): string {
  const toks = tokenizeSQL(stmt);
  const t = toks.find((x) => x.type === 'kw' || x.type === 'id');
  return t ? t.value.toUpperCase() : '';
}
