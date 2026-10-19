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

import { type ConfigListFacts, parseConfigComponentsCached } from './config-components-cache';
import { describe, expect, test } from 'bun:test';

const NO_FACTS: ConfigListFacts = { inputs: [], processors: [], outputs: [], end: 'none' };

describe('parseConfigComponentsCached', () => {
  test('reads the component names and how the pipeline ends from one parse', () => {
    expect(
      parseConfigComponentsCached('input:\n  generate:\n    count: 5\n    mapping: root = 1\noutput:\n  drop: {}\n')
    ).toEqual({ inputs: ['generate'], processors: [], outputs: ['drop'], end: 'finite' });
  });

  test('an empty or unparseable config has no components and no answer', () => {
    expect(parseConfigComponentsCached('')).toEqual(NO_FACTS);
    expect(parseConfigComponentsCached('{{{{not valid yaml')).toEqual(NO_FACTS);
  });
});
