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

import {
  formatTokenText,
  looksLikeJs,
  looksLikeJsCode,
  parseFilterInput,
  sameFieldTokens,
  stripJsPrefix,
  tokenEditText,
  tokenQueryText,
} from './filter-token';
import { fieldTokensParser } from '../hooks/use-messages-url-state';
import type { FieldFilterToken } from '../types';

describe('parseFilterInput', () => {
  test('parses partition equality', () => {
    expect(parseFilterInput('partition:2')).toEqual({ field: 'partition', op: 'eq', value: '2' });
  });

  test('parses offset comparisons', () => {
    expect(parseFilterInput('offset>48210')).toEqual({ field: 'offset', op: 'gt', value: '48210' });
    expect(parseFilterInput('offset<100')).toEqual({ field: 'offset', op: 'lt', value: '100' });
  });

  test('parses key/value contains and not-equals', () => {
    expect(parseFilterInput('key:abc')).toEqual({ field: 'key', op: 'contains', value: 'abc' });
    expect(parseFilterInput('key!=abc')).toEqual({ field: 'key', op: 'neq', value: 'abc' });
  });

  test('parses nested value paths', () => {
    expect(parseFilterInput('value.address.city:Berlin')).toEqual({
      field: 'value.address.city',
      op: 'contains',
      value: 'Berlin',
    });
  });

  test('rejects plain text, unknown fields, and empty values', () => {
    expect(parseFilterInput('hello world')).toBeNull();
    expect(parseFilterInput('timestamp:5')).toBeNull();
    expect(parseFilterInput('partition:')).toBeNull();
    expect(parseFilterInput('')).toBeNull();
  });

  test('quoted values keep internal spaces', () => {
    expect(parseFilterInput('value:"New York"')).toEqual({ field: 'value', op: 'contains', value: 'New York' });
    expect(parseFilterInput('key!="New York"')).toEqual({ field: 'key', op: 'neq', value: 'New York' });
  });

  test('an unterminated quote is treated as incomplete input', () => {
    expect(parseFilterInput('value:"New')).toBeNull();
    expect(parseFilterInput('value:"')).toBeNull();
  });
});

describe('formatTokenText / tokenEditText', () => {
  test('formats field tokens per operator', () => {
    expect(formatTokenText({ kind: 'field', field: 'partition', op: 'eq', value: '2' })).toBe('partition:2');
    expect(formatTokenText({ kind: 'field', field: 'offset', op: 'gt', value: '10' })).toBe('offset>10');
    expect(formatTokenText({ kind: 'field', field: 'offset', op: 'lt', value: '10' })).toBe('offset<10');
    expect(formatTokenText({ kind: 'field', field: 'key', op: 'neq', value: 'x' })).toBe('key!=x');
  });

  test('formats js tokens with name fallback to code', () => {
    expect(formatTokenText({ kind: 'js', code: 'value.version === 0', name: 'v0 only' })).toBe('ƒ v0 only');
    expect(formatTokenText({ kind: 'js', code: 'value.version === 0' })).toBe('ƒ value.version === 0');
  });

  test('tokenEditText round-trips through parseFilterInput', () => {
    const token = { kind: 'field' as const, field: 'offset', op: 'gt' as const, value: '48210' };
    expect(parseFilterInput(tokenEditText(token))).toEqual({ field: 'offset', op: 'gt', value: '48210' });
  });

  test('tokenEditText returns raw code for js tokens', () => {
    expect(tokenEditText({ kind: 'js', code: 'return true', name: 'all' })).toBe('return true');
  });

  test('tokenEditText quote-wraps multi-word values and round-trips', () => {
    const token = { kind: 'field' as const, field: 'value', op: 'contains' as const, value: 'New York' };
    expect(tokenEditText(token)).toBe('value:"New York"');
    expect(parseFilterInput(tokenEditText(token))).toEqual({ field: 'value', op: 'contains', value: 'New York' });
  });
});

describe('tokenQueryText / fieldTokensParser (URL persistence)', () => {
  test('tokenQueryText keeps eq distinct from contains', () => {
    expect(tokenQueryText({ kind: 'field', field: 'offset', op: 'eq', value: '5' })).toBe('offset=5');
    expect(tokenQueryText({ kind: 'field', field: 'key', op: 'contains', value: 'abc' })).toBe('key:abc');
  });

  test('parseFilterInput reads = as equality for any field', () => {
    expect(parseFilterInput('offset=5')).toEqual({ field: 'offset', op: 'eq', value: '5' });
  });

  test('serialize/parse round-trips every operator', () => {
    const tokens: FieldFilterToken[] = [
      { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
      { kind: 'field', field: 'offset', op: 'eq', value: '5' },
      { kind: 'field', field: 'offset', op: 'gt', value: '10' },
      { kind: 'field', field: 'value.address.city', op: 'neq', value: 'Berlin' },
    ];
    const serialized = fieldTokensParser.serialize(tokens);
    expect(fieldTokensParser.parse(serialized)).toEqual(tokens);
  });

  test('round-trips values containing commas and percent signs', () => {
    const tokens: FieldFilterToken[] = [
      { kind: 'field', field: 'value', op: 'contains', value: 'hello, world' },
      { kind: 'field', field: 'key', op: 'contains', value: '100%' },
    ];
    expect(fieldTokensParser.parse(fieldTokensParser.serialize(tokens))).toEqual(tokens);
  });

  test('drops unparseable fragments instead of failing', () => {
    expect(fieldTokensParser.parse('key:abc,garbage,offset>1')).toEqual([
      { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
      { kind: 'field', field: 'offset', op: 'gt', value: '1' },
    ]);
  });
});

describe('sameFieldTokens', () => {
  test('true for identical arrays, false when a value, op, or order differs', () => {
    const a: FieldFilterToken[] = [
      { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
      { kind: 'field', field: 'offset', op: 'gt', value: '5' },
    ];
    const sameValues: FieldFilterToken[] = [
      { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
      { kind: 'field', field: 'offset', op: 'gt', value: '5' },
    ];
    expect(sameFieldTokens(a, sameValues)).toBe(true);

    const differentValue: FieldFilterToken[] = [
      { kind: 'field', field: 'key', op: 'contains', value: 'abc' },
      { kind: 'field', field: 'offset', op: 'gt', value: '6' },
    ];
    expect(sameFieldTokens(a, differentValue)).toBe(false);

    const reordered: FieldFilterToken[] = [a[1], a[0]];
    expect(sameFieldTokens(a, reordered)).toBe(false);
  });

  test('false when lengths differ, true for two empty arrays', () => {
    const a: FieldFilterToken[] = [{ kind: 'field', field: 'key', op: 'contains', value: 'abc' }];
    expect(sameFieldTokens(a, [])).toBe(false);
    expect(sameFieldTokens([], [])).toBe(true);
  });

  test('is the same comparator fieldTokensParser.eq uses for URL persistence', () => {
    expect(fieldTokensParser.eq).toBe(sameFieldTokens);
  });
});

describe('looksLikeJs / stripJsPrefix', () => {
  test('detects js: prefixes and code-like expressions', () => {
    expect(looksLikeJs('js: value.version === 0')).toBe(true);
    expect(looksLikeJs('javascript:return true')).toBe(true);
    expect(looksLikeJs('value.version === 0')).toBe(true);
    expect(looksLikeJs('offset % 2 === 0')).toBe(true);
  });

  test('does not flag plain text or parseable field tokens', () => {
    expect(looksLikeJs('hello world')).toBe(false);
    expect(looksLikeJs('partition:2')).toBe(false);
    expect(looksLikeJs('offset>10')).toBe(false);
  });

  test('stripJsPrefix removes both prefixes and leaves bare code alone', () => {
    expect(stripJsPrefix('js: return true')).toBe('return true');
    expect(stripJsPrefix('javascript: return true')).toBe('return true');
    expect(stripJsPrefix('return true')).toBe('return true');
  });
});

describe('looksLikeJsCode', () => {
  test('a plain label is not code', () => {
    expect(looksLikeJsCode('dach-region')).toBe(false);
    expect(looksLikeJsCode('my filter name')).toBe(false);
  });

  test('operators, keywords, and punctuation all read as code', () => {
    expect(looksLikeJsCode('value != null')).toBe(true);
    expect(looksLikeJsCode('value.version === 0')).toBe(true);
    expect(looksLikeJsCode('return true')).toBe(true);
    expect(looksLikeJsCode('offset % 2 === 0')).toBe(true);
    expect(looksLikeJsCode('key === "example"')).toBe(true);
  });
});
