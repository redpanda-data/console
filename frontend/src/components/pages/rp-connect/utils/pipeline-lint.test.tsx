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

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { describe, expect, it } from 'vitest';

import { mapLintHintsToNodes } from './pipeline-lint';

const hint = (line: number, msg: string): LintHint => ({ line, column: 1, hint: msg, lintType: 'config' }) as LintHint;

// Lines (1-based):
// 1 pipeline:
// 2   processors:
// 3     - mapping: 'root = this'
// 4     - branch:
// 5         request_map: 'root = this'
// 6         processors:
// 7           - http:
// 8               url: not-a-url
// 9         result_map: 'root = this'
// 10 output:
// 11   drop: {}
const yaml = `pipeline:
  processors:
    - mapping: 'root = this'
    - branch:
        request_map: 'root = this'
        processors:
          - http:
              url: not-a-url
        result_map: 'root = this'
output:
  drop: {}`;

describe('mapLintHintsToNodes', () => {
  it('attaches a hint to the most specific (nested) node whose YAML range contains its line', () => {
    const byNode = mapLintHintsToNodes(yaml, [hint(8, 'bad url')]);
    // Line 8 is inside the http leaf (nested in branch), not the branch container.
    expect(byNode.get('proc-1-processors-p0')?.map((h) => h.hint)).toEqual(['bad url']);
    expect(byNode.has('proc-1')).toBe(false);
  });

  it('attaches a hint to a top-level processor', () => {
    const byNode = mapLintHintsToNodes(yaml, [hint(3, 'bad mapping')]);
    expect(byNode.get('proc-0')?.map((h) => h.hint)).toEqual(['bad mapping']);
  });

  it('groups multiple hints by node', () => {
    const byNode = mapLintHintsToNodes(yaml, [hint(8, 'a'), hint(8, 'b'), hint(3, 'c')]);
    expect(byNode.get('proc-1-processors-p0')).toHaveLength(2);
    expect(byNode.get('proc-0')).toHaveLength(1);
  });

  it('ignores hints that fall outside any node and never throws on bad YAML', () => {
    expect(mapLintHintsToNodes(yaml, [hint(1, 'top-level')]).size).toBe(0);
    expect(mapLintHintsToNodes('{{{', [hint(1, 'x')]).size).toBe(0);
    expect(mapLintHintsToNodes('', [hint(1, 'x')]).size).toBe(0);
  });
});
