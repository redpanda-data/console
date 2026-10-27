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

import { splitControlChars } from './split-control-chars';
import { describe, expect, test } from 'bun:test';

describe('splitControlChars', () => {
  test('keeps printable text as one run', () => {
    expect(splitControlChars('hello')).toEqual(['hello']);
  });

  test('splits control characters out as char codes, in order', () => {
    expect(splitControlChars('a\tb\n\nc')).toEqual(['a', 9, 'b', 10, 10, 'c']);
  });

  test('returns no parts for an empty string', () => {
    expect(splitControlChars('')).toEqual([]);
  });

  test('reads at most maxLength characters', () => {
    expect(splitControlChars('ab\ncd', 3)).toEqual(['ab', 10]);
  });

  test('always reads the first character, even for a zero maxLength', () => {
    expect(splitControlChars('abc', 0)).toEqual(['a']);
  });
});
