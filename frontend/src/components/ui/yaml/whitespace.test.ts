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

import { normalizePastedWhitespace } from './whitespace';
import { describe, expect, test } from 'bun:test';

const NBSP = String.fromCharCode(0xa0);
const EM_SPACE = String.fromCharCode(0x20_03);

describe('normalize pasted whitespace', () => {
  test('replaces non-breaking-space indentation with regular spaces', () => {
    const pasted = `input:\n${NBSP}${NBSP}redpanda:\n${NBSP}${NBSP}${NBSP}${NBSP}seed_brokers: []`;
    expect(normalizePastedWhitespace(pasted)).toBe('input:\n  redpanda:\n    seed_brokers: []');
  });

  test('normalizes other unicode space separators', () => {
    expect(normalizePastedWhitespace(`a${EM_SPACE}b`)).toBe('a b');
  });

  test('leaves regular spaces and content unchanged', () => {
    const valid = 'input:\n  redpanda: {}\n';
    expect(normalizePastedWhitespace(valid)).toBe(valid);
  });
});
