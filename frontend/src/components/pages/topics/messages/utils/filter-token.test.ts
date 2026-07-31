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
  parseFilterInput,
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
