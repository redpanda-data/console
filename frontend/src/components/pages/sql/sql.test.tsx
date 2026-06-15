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

import { firstKeyword } from './sql';

describe('sql helpers', () => {
  test('firstKeyword skips comments and uppercases', () => {
    expect(firstKeyword('select * from t')).toBe('SELECT');
    expect(firstKeyword('-- a comment\nselect * from t')).toBe('SELECT');
    expect(firstKeyword('/* block */ INSERT INTO t VALUES (1)')).toBe('INSERT');
    expect(firstKeyword('  \n grant all on t to u')).toBe('GRANT');
    expect(firstKeyword('-- only a comment')).toBe('');
    expect(firstKeyword('')).toBe('');
  });
});
