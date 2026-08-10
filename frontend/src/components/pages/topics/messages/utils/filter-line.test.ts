/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, test } from 'vitest';

import { formatFilterLine, parseFilterLine, tokenizeLine, wordRangeAtCaret } from './filter-line';

describe('tokenizeLine', () => {
  test('splits on whitespace with correct offsets', () => {
    expect(tokenizeLine('key:abc value:def')).toEqual([
      { text: 'key:abc', start: 0, end: 7 },
      { text: 'value:def', start: 8, end: 17 },
    ]);
  });

  test('collapses repeated whitespace and ignores leading/trailing', () => {
    expect(tokenizeLine('  key:abc   value:def  ')).toEqual([
      { text: 'key:abc', start: 2, end: 9 },
      { text: 'value:def', start: 12, end: 21 },
    ]);
  });

  test('keeps a quoted span as one word even with internal spaces', () => {
    expect(tokenizeLine('value:"New York" key:abc')).toEqual([
      { text: 'value:"New York"', start: 0, end: 16 },
      { text: 'key:abc', start: 17, end: 24 },
    ]);
  });

  test('an unterminated quote swallows the rest of the line as one word', () => {
    expect(tokenizeLine('value:"New York')).toEqual([{ text: 'value:"New York', start: 0, end: 15 }]);
  });

  test('a stray literal quote mid-word does not swallow the rest of the line', () => {
    expect(tokenizeLine('key:a"b partition:1 offset>5')).toEqual([
      { text: 'key:a"b', start: 0, end: 7 },
      { text: 'partition:1', start: 8, end: 19 },
      { text: 'offset>5', start: 20, end: 28 },
    ]);
  });

  test('empty and whitespace-only input yields no words', () => {
    expect(tokenizeLine('')).toEqual([]);
    expect(tokenizeLine('   ')).toEqual([]);
  });
});

describe('parseFilterLine', () => {
  test('recognizes multiple field tokens typed continuously', () => {
    expect(parseFilterLine('key:abc value:def')).toEqual({
      partitionId: null,
      fieldTokens: [
        { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
        { kind: 'field', field: 'value', op: 'contains', value: 'def' },
      ],
      remainder: '',
      tokenRanges: [
        { start: 0, end: 7 },
        { start: 8, end: 17 },
      ],
    });
  });

  test('extracts a partition word separately from field tokens', () => {
    expect(parseFilterLine('key:abc partition:2')).toEqual({
      partitionId: 2,
      fieldTokens: [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }],
      remainder: '',
      tokenRanges: [
        { start: 0, end: 7 },
        { start: 8, end: 19 },
      ],
    });
  });

  test('a non-numeric partition word falls into the remainder instead of producing NaN', () => {
    expect(parseFilterLine('partition:a')).toEqual({
      partitionId: null,
      fieldTokens: [],
      remainder: 'partition:a',
      tokenRanges: [],
    });
    expect(parseFilterLine('partition:-1')).toEqual({
      partitionId: null,
      fieldTokens: [],
      remainder: 'partition:-1',
      tokenRanges: [],
    });
  });

  test('partition>2 stays in the remainder instead of silently collapsing to exact partition 2', () => {
    expect(parseFilterLine('partition>2')).toEqual({
      partitionId: null,
      fieldTokens: [],
      remainder: 'partition>2',
      tokenRanges: [],
    });
    expect(parseFilterLine('partition!=2')).toEqual({
      partitionId: null,
      fieldTokens: [],
      remainder: 'partition!=2',
      tokenRanges: [],
    });
  });

  test('a stray literal quote mid-word does not swallow the tokens after it', () => {
    expect(parseFilterLine('key:a"b partition:1 offset>5')).toEqual({
      partitionId: 1,
      fieldTokens: [
        { kind: 'field', field: 'key', op: 'contains', value: 'a"b' },
        { kind: 'field', field: 'offset', op: 'gt', value: '5' },
      ],
      remainder: '',
      tokenRanges: [
        { start: 0, end: 7 },
        { start: 8, end: 19 },
        { start: 20, end: 28 },
      ],
    });
  });

  test('unrecognized words join into the remainder, preserving order', () => {
    expect(parseFilterLine('hello key:abc world')).toEqual({
      partitionId: null,
      fieldTokens: [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }],
      remainder: 'hello world',
      // "hello" and "world" don't parse, so only the middle word contributes a range
      tokenRanges: [{ start: 6, end: 13 }],
    });
  });

  test('a quoted multi-word value stays one token', () => {
    expect(parseFilterLine('value:"New York"')).toEqual({
      partitionId: null,
      fieldTokens: [{ kind: 'field', field: 'value', op: 'contains', value: 'New York' }],
      remainder: '',
      tokenRanges: [{ start: 0, end: 16 }],
    });
  });

  test('a still-open quote is not yet a token — it stays in the remainder verbatim', () => {
    expect(parseFilterLine('value:"New York')).toEqual({
      partitionId: null,
      fieldTokens: [],
      remainder: 'value:"New York',
      tokenRanges: [],
    });
  });

  test('empty line has no tokens and an empty remainder', () => {
    expect(parseFilterLine('')).toEqual({ partitionId: null, fieldTokens: [], remainder: '', tokenRanges: [] });
  });
});

describe('formatFilterLine', () => {
  test('round-trips through parseFilterLine', () => {
    const line = formatFilterLine(
      2,
      [
        { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
        { kind: 'field', field: 'value', op: 'contains', value: 'New York' },
      ],
      'hello'
    );
    expect(line).toBe('partition:2 key:abc value:"New York" hello');
    expect(parseFilterLine(line)).toEqual({
      partitionId: 2,
      fieldTokens: [
        { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
        { kind: 'field', field: 'value', op: 'contains', value: 'New York' },
      ],
      remainder: 'hello',
      tokenRanges: [
        { start: 0, end: 11 },
        { start: 12, end: 19 },
        { start: 20, end: 36 },
      ],
    });
  });

  test('omits partition and remainder when absent', () => {
    expect(formatFilterLine(-1, [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }], '')).toBe('key:abc');
  });

  test('an empty line formats to an empty string', () => {
    expect(formatFilterLine(-1, [], '')).toBe('');
  });
});

describe('wordRangeAtCaret', () => {
  const line = 'key:abc value:def';

  test('caret inside a word returns that word', () => {
    expect(wordRangeAtCaret(line, 2)).toEqual({ text: 'key:abc', start: 0, end: 7 });
    expect(wordRangeAtCaret(line, 12)).toEqual({ text: 'value:def', start: 8, end: 17 });
  });

  test('caret right at the end of a word still returns that word', () => {
    expect(wordRangeAtCaret(line, 7)).toEqual({ text: 'key:abc', start: 0, end: 7 });
  });

  test('caret sitting in whitespace between words returns null', () => {
    // two spaces so the caret can sit strictly between them, touching neither word
    expect(wordRangeAtCaret('key:abc  value:def', 8)).toBeNull();
  });

  test('empty line returns null', () => {
    expect(wordRangeAtCaret('', 0)).toBeNull();
  });
});
