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

import { parseA2AError } from './parse-a2a-error';

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
    expect(result).toEqual({
      code: -1,
      message: 'boom',
      data: undefined,
    });
  });
});
