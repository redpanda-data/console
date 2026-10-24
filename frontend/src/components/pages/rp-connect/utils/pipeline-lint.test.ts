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

import {
  localStopConditionLintHints,
  localYamlLintHints,
  mapLintHintsToNodes,
  mergeLintHints,
  nodeLineRanges,
} from './pipeline-lint';
import { describe, expect, it } from 'bun:test';

const hint = (line: number, msg: string): LintHint => ({ line, column: 1, hint: msg, lintType: 'config' }) as LintHint;

// Line numbers below are 1-based against this document; `url: not-a-url` is line 8.
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

  it("attaches a processor-switch `check` hint to the case's rendered entry node, not the wrapper", () => {
    // Line 4 is the malformed routing condition; the case wrapper itself is never rendered.
    const switchYaml = `pipeline:
  processors:
    - switch:
        - check: 'this.region == "us'
          processors:
            - mapping: 'root = this'
output:
  drop: {}`;
    const byNode = mapLintHintsToNodes(switchYaml, [hint(4, 'expected end quote')]);
    expect(byNode.get('proc-0-case-1-p0')?.map((h) => h.hint)).toEqual(['expected end quote']);
    expect(byNode.has('proc-0-case-1')).toBe(false);
  });

  it('falls back to the case wrapper for an empty (check-only) processor-switch case', () => {
    const switchYaml = `pipeline:
  processors:
    - switch:
        - check: 'this.region == "us'
output:
  drop: {}`;
    const byNode = mapLintHintsToNodes(switchYaml, [hint(4, 'expected end quote')]);
    expect(byNode.has('proc-0-case-1')).toBe(true);
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

  it('folds local hints in alongside error and query hints', () => {
    const merged = mergeLintHints({}, [hint(9, 'server lint')], [hint(15, 'syntax error')]);
    expect(Object.keys(merged)).toHaveLength(2);
    expect(Object.values(merged).find((h) => h.line === 15)?.hint).toBe('syntax error');
  });
});

describe('localYamlLintHints', () => {
  it('returns no hints for valid (or blank) YAML', () => {
    expect(localYamlLintHints('')).toEqual([]);
    expect(localYamlLintHints('   \n')).toEqual([]);
    expect(localYamlLintHints('input:\n  generate: {}\noutput:\n  drop: {}')).toEqual([]);
  });

  it('reports a YAML syntax error as an error hint with a clean single-line message', () => {
    // `fds` is a bare scalar where a mapping key is expected — the class the server rejected on save.
    const hints = localYamlLintHints('input:\n  generate: {}\nfds\noutput:\n  drop: {}');
    expect(hints.length).toBeGreaterThan(0);
    expect(hints[0].lintType).toBe('error');
    expect(hints[0].line).toBeGreaterThan(0);
    // No embedded code snippet (prettyErrors: false), so it renders as one panel row.
    expect(hints[0].hint).not.toContain('\n');
  });

  it('maps the error to its 1-based line', () => {
    // Unclosed flow sequence on line 1 — a deterministic position.
    const hints = localYamlLintHints('input: [1, 2');
    expect(hints[0]?.line).toBe(1);
  });
});

describe('stop conditions', () => {
  it('a hint on a read_until setting lands on the input it wraps', () => {
    const wrapped = `input:
  read_until:
    idle_timeout: soon
    input:
      kafka: { topics: [a] }
output:
  drop: {}`;
    // Line 3 is `idle_timeout`, outside the kafka component itself.
    expect(
      mapLintHintsToNodes(wrapped, [hint(3, 'bad duration')])
        .get('input-0')
        ?.map((h) => h.hint)
    ).toEqual(['bad duration']);
  });
});

describe('localStopConditionLintHints', () => {
  const hintsFor = (config: string) => localStopConditionLintHints(config).map((h) => [h.line, h.hint]);

  it('flags a read_until with nothing to stop on, on its own line', () => {
    expect(hintsFor('input:\n  read_until:\n    input:\n      kafka: {}\n')).toEqual([
      [2, 'read_until needs a check or an idle_timeout to know when to stop.'],
    ]);
  });

  it('flags one with no input, and an idle_timeout that is not a duration', () => {
    expect(hintsFor('input:\n  broker:\n    inputs:\n      - read_until:\n          idle_timeout: 30\n')).toEqual([
      [4, 'read_until needs an input to read from.'],
      [5, 'idle_timeout must be a duration such as 30s, 5m or 1h.'],
    ]);
  });

  it('accepts a complete one, an env var timeout, and anything outside the inputs', () => {
    expect(hintsFor('input:\n  read_until:\n    idle_timeout: 30s\n    input:\n      kafka: {}\n')).toEqual([]);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal Connect env var reference, not a JS template
    expect(hintsFor('input:\n  read_until:\n    idle_timeout: ${IDLE}\n    input:\n      kafka: {}\n')).toEqual([]);
    expect(hintsFor('pipeline:\n  processors:\n    - mapping: |\n        root.read_until = {}\n')).toEqual([]);
  });

  it('flags a timeout Connect accepts but never acts on', () => {
    expect(hintsFor('input:\n  read_until:\n    idle_timeout: 0s\n    input:\n      kafka: {}\n')).toEqual([
      [3, 'An idle_timeout of 0 never fires. Use a duration such as 30s.'],
    ]);
    expect(
      hintsFor('input:\n  read_until:\n    check: this.done\n    idle_timeout: -1s\n    input:\n      kafka: {}\n')
    ).toEqual([[4, 'A negative idle_timeout is ignored. Use a duration such as 30s.']]);
  });

  it('reports nothing, rather than throwing, when a wrapper expands past the alias limit', () => {
    const levels = ['a: &a [x, x, x, x, x, x, x, x, x, x]'];
    for (const [prev, name] of [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]) {
      levels.push(`${name}: &${name} [${Array.from({ length: 10 }, () => `*${prev}`).join(', ')}]`);
    }
    const bomb = `${levels.join('\n')}\ninput:\n  read_until:\n    idle_timeout: 5s\n    input:\n      generate:\n        mapping: [*d, *d, *d, *d, *d, *d, *d, *d, *d, *d]\n`;
    expect(localStopConditionLintHints(bomb)).toEqual([]);
  });

  it('reads the wrapper as Connect does: merge keys, a scalar check, a null input', () => {
    const merged =
      'base: &base\n  idle_timeout: 30s\ninput:\n  read_until:\n    <<: *base\n    input:\n      kafka: {}\n';
    expect(hintsFor(merged)).toEqual([]);
    expect(hintsFor('input:\n  read_until:\n    check: true\n    input:\n      kafka: {}\n')).toEqual([]);
    expect(hintsFor('input:\n  read_until:\n    check: this.done\n    input: null\n')).toEqual([
      [2, 'read_until needs an input to read from.'],
    ]);
  });

  it('flags an empty read_until, and an input with no component', () => {
    expect(hintsFor('input:\n  read_until:\n')).toEqual([
      [2, 'read_until needs a check or an idle_timeout to know when to stop.'],
      [2, 'read_until needs an input to read from.'],
    ]);
    expect(hintsFor('input:\n  read_until:\n    idle_timeout: 5s\n    input: {}\n')).toEqual([
      [2, 'read_until needs an input to read from.'],
    ]);
  });

  it('lands on the input it wraps', () => {
    const wrapped = 'input:\n  read_until:\n    input:\n      kafka: {}\noutput:\n  drop: {}';
    expect([...mapLintHintsToNodes(wrapped, localStopConditionLintHints(wrapped)).keys()]).toEqual(['input-0']);
  });
});
