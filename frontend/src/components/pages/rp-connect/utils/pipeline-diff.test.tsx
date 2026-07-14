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

import { describe, expect, it } from 'vitest';

import { changedNodeIds, changedNodeIdsFromBaseline, nodeConfigSignatures } from './pipeline-diff';

const base = `pipeline:
  processors:
    - mapping: 'root = this'
    - log: { message: hi }
output:
  drop: {}`;

describe('changedNodeIds', () => {
  it('reports the node whose config changed', () => {
    const next = base.replace('message: hi', 'message: bye');
    expect(changedNodeIds(base, next)).toEqual(['proc-1']);
  });

  it('reports a restored/added node', () => {
    const without = `pipeline:
  processors:
    - mapping: 'root = this'
output:
  drop: {}`;
    // Going from the shorter config back to base "adds" the log processor.
    expect(changedNodeIds(without, base)).toContain('proc-1');
  });

  it('returns nothing when the configs are identical', () => {
    expect(changedNodeIds(base, base)).toEqual([]);
  });

  it('flags only the inserted node when a processor is inserted at the head', () => {
    const next = `pipeline:
  processors:
    - http: { url: 'http://x' }
    - mapping: 'root = this'
    - log: { message: hi }
output:
  drop: {}`;
    expect(changedNodeIds(base, next)).toEqual(['proc-0']);
  });

  it('does not flag nodes whose identical config merely shifted position', () => {
    const next = `pipeline:
  processors:
    - log: { message: hi }
    - mapping: 'root = this'
output:
  drop: {}`;
    expect(changedNodeIds(base, next)).toEqual([]);
  });

  it('attributes a nested edit to the child only, not its ancestor containers', () => {
    const nested = `pipeline:
  processors:
    - switch:
        - check: 'this.x == 1'
          processors:
            - mapping: 'root = this'
output:
  drop: {}`;
    const next = nested.replace('root = this', 'root = this.foo');
    // Editing the mapping changes the switch + case config too, but only the mapping is reported.
    expect(changedNodeIds(nested, next)).toEqual(['proc-0-case-1-p0']);
  });

  it('never throws on malformed YAML', () => {
    expect(changedNodeIds('{{{', base)).toEqual(expect.any(Array));
    expect(changedNodeIds(base, '{{{')).toEqual([]);
  });
});

describe('changedNodeIdsFromBaseline', () => {
  it('matches changedNodeIds when diffing against pre-computed baseline signatures', () => {
    const baseline = nodeConfigSignatures(base);
    const next = base.replace('message: hi', 'message: bye');
    // One baseline serves repeated diffs (the panel re-diffs every keystroke against a constant baseline).
    expect(changedNodeIdsFromBaseline(baseline, next)).toEqual(changedNodeIds(base, next));
    expect(changedNodeIdsFromBaseline(baseline, base)).toEqual([]);
  });

  it('handles a malformed-YAML baseline like changedNodeIds does', () => {
    expect(changedNodeIdsFromBaseline(nodeConfigSignatures('{{{'), base)).toEqual(changedNodeIds('{{{', base));
  });
});
