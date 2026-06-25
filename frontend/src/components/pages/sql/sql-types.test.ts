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

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { ErrorInfoSchema } from 'protogen/google/rpc/error_details_pb';
import { describe, expect, test } from 'vitest';

import { arrayElementPgType, columnKindForPgType, hintFromError, isArrayPgType, splitQueryError } from './sql-types';

describe('columnKindForPgType', () => {
  test.each([
    ['INT8', 'num'],
    ['BIGINT', 'num'],
    ['NUMERIC(10,2)', 'num'],
    ['BOOL', 'bool'],
    ['TIMESTAMPTZ', 'time'],
    ['TIMESTAMP', 'time'],
    // INTERVAL/POINT contain the INT substring but must not read as numeric.
    ['INTERVAL', 'time'],
    ['POINT', 'str'],
    ['JSON', 'json'],
    ['JSONB', 'json'],
    ['TEXT', 'str'],
    ['UNKNOWN_TYPE', 'str'],
    // Composite columns arrive pre-labelled as "record"/"record[]" from the
    // backend and render with the JSON tree viewer.
    ['record', 'json'],
    ['record[]', 'json'],
  ] as const)('%s → %s', (pgType, kind) => {
    expect(columnKindForPgType(pgType)).toBe(kind);
  });

  test.each([
    ['TEXT[]', 'str'],
    ['_INT4', 'num'],
    ['JSONB[]', 'json'],
    ['ARRAY<STRING>', 'str'],
    ['LIST<TIMESTAMP>', 'time'],
  ] as const)('array %s maps to element kind %s', (pgType, kind) => {
    expect(columnKindForPgType(pgType)).toBe(kind);
  });
});

describe('arrayElementPgType', () => {
  test.each([
    ['TEXT[]', 'TEXT'],
    ['_INT4', 'INT4'],
    ['ARRAY<STRING>', 'STRING'],
    ['list<double>', 'double'],
  ] as const)('%s unwraps to %s', (pgType, element) => {
    expect(arrayElementPgType(pgType)).toBe(element);
  });

  test('non-array types return null', () => {
    expect(arrayElementPgType('TEXT')).toBeNull();
    expect(isArrayPgType('TEXT')).toBe(false);
    expect(isArrayPgType('TEXT[]')).toBe(true);
  });
});

describe('splitQueryError', () => {
  test('splits the trailing hint onto its own field', () => {
    const { message, hint } = splitQueryError('operator does not exist: record -> unknown\n\nHint: use (user).id');
    expect(message).toBe('operator does not exist: record -> unknown');
    expect(hint).toBe('use (user).id');
  });

  test('leaves a hintless message intact', () => {
    const { message, hint } = splitQueryError('syntax error at or near "SELCT"');
    expect(message).toBe('syntax error at or near "SELCT"');
    expect(hint).toBeUndefined();
  });
});

describe('hintFromError', () => {
  test('reads the hint from ErrorInfo metadata', () => {
    const error = new ConnectError('boom', undefined, undefined, [
      {
        desc: ErrorInfoSchema,
        value: create(ErrorInfoSchema, { reason: 'REASON_INVALID_INPUT', metadata: { hint: 'use (customer).id' } }),
      },
    ]);
    expect(hintFromError(error)).toBe('use (customer).id');
  });

  test('returns undefined when there is no ErrorInfo hint', () => {
    expect(hintFromError(new ConnectError('boom'))).toBeUndefined();
    expect(hintFromError(new Error('plain'))).toBeUndefined();
  });
});
