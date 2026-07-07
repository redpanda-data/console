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

import { mapLintHintsToNodes, mergeLintHints, nodeLineRanges } from './pipeline-lint';

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

  it("attaches a lint hint in a switch case's `check` to the CASE node, not the enclosing switch", () => {
    // Line 6 is the (malformed) routing condition of the first output-switch case.
    const switchYaml = `pipeline:
  processors: []
output:
  switch:
    cases:
      - check: 'this.region == "us'
        output:
          drop: {}
      - output:
          drop: {}`;
    const byNode = mapLintHintsToNodes(switchYaml, [hint(6, 'unexpected end of expression')]);
    // The condition error maps to the case's own node, not the whole switch.
    expect(byNode.has('output-switch-0')).toBe(true);
  });
});

describe('nodeLineRanges', () => {
  it('ends a node on its last content line, not the line below', () => {
    const ranges = nodeLineRanges(yaml);
    // The single-line mapping is line 3 only — not extending to `- branch:` below (trailing-newline over-select bug).
    expect(ranges.find((r) => r.id === 'proc-0')).toEqual({ id: 'proc-0', start: 3, end: 3, span: 0 });
    // The branch container spans its own block (lines 4–9), stopping before `output:`.
    expect(ranges.find((r) => r.id === 'proc-1')).toMatchObject({ start: 4, end: 9 });
  });

  it('keeps a multi-line block scalar fully selected', () => {
    const multiline = `pipeline:
  processors:
    - mapping: |
        root = this
        root.x = 1
output:
  drop: {}`;
    // Lines: 3 `- mapping: |`, 4–5 the block body. The node ends on line 5, not 6.
    expect(nodeLineRanges(multiline).find((r) => r.id === 'proc-0')).toMatchObject({ start: 3, end: 5 });
  });
});

describe('mergeLintHints', () => {
  const named = (line: number, msg: string, lintType: string): LintHint =>
    ({ line, column: 1, hint: msg, lintType }) as LintHint;

  it('drops a query hint that duplicates a save-error hint, keeping the named copy', () => {
    const errorHints = { LINTBADLABEL: named(21, "invalid label 'fd fdas'", 'LINTBADLABEL') };
    const queryHints = [hint(21, "invalid label 'fd fdas'"), hint(54, 'another problem')];

    const merged = mergeLintHints(errorHints, queryHints);

    expect(Object.keys(merged)).toHaveLength(2);
    // The deduped survivor carries the lint name (shown as the heading).
    const values = Object.values(merged);
    expect(values.find((h) => h.line === 21)?.lintType).toBe('LINTBADLABEL');
    expect(values.find((h) => h.line === 54)?.hint).toBe('another problem');
  });

  it('keeps hints with the same message on different lines as distinct problems', () => {
    const errorHints = { LINTBADLABEL: named(21, 'invalid label', 'LINTBADLABEL') };
    const merged = mergeLintHints(errorHints, [hint(54, 'invalid label')]);
    expect(Object.keys(merged)).toHaveLength(2);
  });

  it('dedupes repeats within a single source too', () => {
    const merged = mergeLintHints({}, [hint(3, 'same'), hint(3, 'same')]);
    expect(Object.keys(merged)).toHaveLength(1);
  });
});
