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

import { describe, expect, test } from 'vitest';

import { lookupErrorMeta, parseA2AError } from './parse-a2a-error';

// Top-level regex literal — biome's `useTopLevelRegex` rule flags inline
// regexes inside test bodies because they are recompiled on every call.
const METHOD_NOT_FOUND_HINT_PATTERN = /A2A|MCP|capabilities/i;

// ---------------------------------------------------------------------------
// Table-driven coverage of the regex-based A2A error parser. The parser has
// to tolerate a grab-bag of formats produced by the a2a-js SDK's
// stringified JSON-RPC errors, plus bare Error/string/unknown inputs. Each
// row below pins down one of those shapes; the existing hook-level suite in
// use-message-streaming.test.ts exercises the parser through the full
// streamMessage error path.
// ---------------------------------------------------------------------------

type Row = {
  name: string;
  input: unknown;
  expected: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
};

const rows: Row[] = [
  {
    name: 'SSE event-wrapped error with structured code + data',
    input: new Error('SSE event contained an error: Connection reset (Code: -1) Data: {}'),
    expected: { code: -1, message: 'Connection reset', data: {} },
  },
  {
    name: 'JSON-RPC streaming error with data payload',
    input: new Error('Error during streaming for task-abc: network timeout (Code: 500) Data: {"detail":"timeout"}'),
    expected: { code: 500, message: 'network timeout', data: { detail: 'timeout' } },
  },
  {
    // Regression guard: the old `[^}]*` stopped at the first `}` so nested
    // data got truncated and JSON.parse threw silently.
    name: 'Data payload containing a nested object is captured in full',
    input: new Error(
      'SSE event contained an error: validation failed (Code: -32602) Data: {"field":{"reason":"expired","after":1700000000}}'
    ),
    expected: {
      code: -32_602,
      message: 'validation failed',
      data: { field: { reason: 'expired', after: 1_700_000_000 } },
    },
  },
  {
    name: 'error without Code: falls back to -1 and preserves raw message',
    input: 'something completely unexpected',
    expected: { code: -1, message: 'something completely unexpected' },
  },
  {
    name: 'invalid JSON in Data: leaves data undefined (preserved legacy behavior)',
    input: new Error('SSE event contained an error: Bad (Code: -1) Data: {not-json}'),
    // data is undefined because JSON.parse throws and the catch swallows.
    expected: { code: -1, message: 'Bad', data: undefined },
  },
  {
    name: 'empty string → Unknown error sentinel',
    input: '',
    expected: { code: -1, message: 'Unknown error' },
  },
  {
    name: 'numeric non-Error input → best-effort stringification',
    input: 42,
    expected: { code: -1, message: '42' },
  },
  {
    name: 'object non-Error input → best-effort stringification',
    // Confirms parseA2AError accepts any `unknown` via String(...) without
    // blowing up. The default Object.prototype.toString is what we get.
    input: { foo: 'bar' },
    expected: { code: -1, message: '[object Object]' },
  },
  {
    name: 'streaming prefix stripped when there is no Code:',
    input: new Error('Error during streaming for task-xyz: connection refused'),
    expected: { code: -1, message: 'connection refused' },
  },
  {
    name: 'SSE prefix stripped when there is no Code:',
    input: new Error('SSE event contained an error: Connection refused'),
    expected: { code: -1, message: 'Connection refused' },
  },
];

describe('parseA2AError (table-driven)', () => {
  test.each(rows)('$name', ({ input, expected }) => {
    const result = parseA2AError(input);

    expect(result.code).toBe(expected.code);
    expect(result.message).toBe(expected.message);

    if ('data' in expected) {
      expect(result.data).toEqual(expected.data);
    }
  });
});

describe('parseA2AError — edge cases not easily expressed as a table row', () => {
  test('positive Code values are parsed as-is', () => {
    const result = parseA2AError(new Error('SSE event contained an error: boom (Code: 32000) Data: {}'));
    expect(result.code).toBe(32_000);
  });

  test('negative JSON-RPC codes survive the regex', () => {
    const result = parseA2AError(
      new Error('SSE event contained an error: auth required (Code: -32001) Data: {"scope":"read"}')
    );
    expect(result.code).toBe(-32_001);
    expect(result.data).toEqual({ scope: 'read' });
  });

  test('Error instance without any structure passes through unchanged', () => {
    const result = parseA2AError(new Error('boom'));
    expect(result.code).toBe(-1);
    expect(result.message).toBe('boom');
    expect(result.data).toBeUndefined();
    // Sentinel -1 code resolves to the generic "Error" title with no hint.
    expect(result.title).toBe('Error');
    expect(result.hint).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Well-known JSON-RPC / A2A / MCP code → (title, hint) lookup coverage.
// One row per code we claim to understand. If a new code is added to the
// lookup table, add a row here too — otherwise `title` defaults to the
// synthetic `Error <code>` fallback.
// ---------------------------------------------------------------------------

type CodeRow = {
  code: number;
  title: string;
  // Hint is optional — we only assert it exists and is non-empty because the
  // exact wording is UI-tunable. Use `false` to assert hint is absent.
  expectHint?: string | false;
};

const codeRows: CodeRow[] = [
  // JSON-RPC 2.0 standard errors — also reused by MCP.
  { code: -32_700, title: 'Parse Error', expectHint: 'JSON' },
  { code: -32_600, title: 'Invalid Request', expectHint: 'JSON-RPC' },
  { code: -32_601, title: 'Method Not Found', expectHint: 'capabilities' },
  { code: -32_602, title: 'Invalid Params', expectHint: 'data' },
  { code: -32_603, title: 'Internal Error', expectHint: 'Retry' },
  { code: -32_000, title: 'Server Error', expectHint: 'Retry' },
  // A2A protocol extensions.
  { code: -32_001, title: 'Task Not Found', expectHint: 'task' },
  { code: -32_002, title: 'Task Not Cancelable' },
  { code: -32_003, title: 'Push Notifications Not Supported' },
  { code: -32_004, title: 'Unsupported Operation', expectHint: 'A2A' },
  { code: -32_005, title: 'Content Type Not Supported' },
  { code: -32_006, title: 'Invalid Agent Response' },
  { code: -32_007, title: 'Authenticated Extended Card Not Configured' },
  { code: -32_008, title: 'Authentication Failed', expectHint: 'Re-authenticate' },
  { code: -32_009, title: 'Forbidden', expectHint: 'agent owner' },
];

describe('lookupErrorMeta — well-known code coverage', () => {
  test.each(codeRows)('code $code → "$title"', ({ code, title, expectHint }) => {
    const meta = lookupErrorMeta(code);
    expect(meta.title).toBe(title);
    if (expectHint === false) {
      expect(meta.hint).toBeUndefined();
    } else if (expectHint) {
      expect(meta.hint ?? '').toContain(expectHint);
    } else {
      // Any non-false / non-string expectHint means "hint should exist".
      expect(meta.hint).toBeDefined();
    }
  });

  test('unknown implementation-defined server code (-32050) is surfaced with the code inline', () => {
    const meta = lookupErrorMeta(-32_050);
    expect(meta.title).toBe('Server Error -32050');
    expect(meta.hint).toBeDefined();
  });

  test('generic fallback for completely foreign code', () => {
    const meta = lookupErrorMeta(42);
    expect(meta.title).toBe('Error 42');
    expect(meta.hint).toBeUndefined();
  });

  test('sentinel -1 (parser could not extract a code) falls back to "Error"', () => {
    const meta = lookupErrorMeta(-1);
    expect(meta.title).toBe('Error');
    expect(meta.hint).toBeUndefined();
  });
});

describe('parseA2AError — title + hint are surfaced end-to-end', () => {
  test('method-not-found (-32601) surfaces the hint in the parsed result', () => {
    const result = parseA2AError(new Error('SSE event contained an error: method unknown (Code: -32601) Data: {}'));
    expect(result.code).toBe(-32_601);
    expect(result.title).toBe('Method Not Found');
    expect(result.hint).toBeDefined();
    expect(result.hint ?? '').toMatch(METHOD_NOT_FOUND_HINT_PATTERN);
  });

  test('MCP-style Internal Error (-32603) surfaces a retry hint', () => {
    const result = parseA2AError(
      new Error('SSE event contained an error: tool execution failed (Code: -32603) Data: {"tool":"delete_topic"}')
    );
    expect(result.code).toBe(-32_603);
    expect(result.title).toBe('Internal Error');
    expect(result.hint).toBeDefined();
  });
});
