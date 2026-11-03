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

import { parse as parseYaml } from 'yaml';

import { CONNECT_CONFIG_FIXTURES } from './connect-config-fixtures';
import { describe, expect, test } from 'bun:test';
import { type PipelineEndStatus, summarizePipelineEndYaml } from '../pages/rp-connect/utils/input-end-behavior';
import { parsePipelineFlowTree } from '../pages/rp-connect/utils/pipeline-flow-parser';
import { localStopConditionLintHints } from '../pages/rp-connect/utils/pipeline-lint';

const yamlOf = (id: string): string => {
  const fixture = CONNECT_CONFIG_FIXTURES.find((f) => f.id === id);
  if (!fixture) {
    throw new Error(`no fixture ${id}`);
  }
  return fixture.yaml;
};

// What each stop-condition fixture is there to show.
const EXPECTED_END: Record<string, PipelineEndStatus> = {
  'stops-generate-count': 'finite',
  'stops-postgres-snapshot': 'finite',
  'stops-topic-backfill': 'finite',
  'stops-end-of-batch-check': 'finite',
  'stops-sequence-catch-up': 'finite',
  'stops-broker-one-endless': 'continuous',
  'stops-broker-all-members': 'finite',
  'stops-broker-own-condition': 'finite',
  'stops-broker-nested-groups': 'finite',
  'stops-broker-batching-period': 'finite',
  'edge-stop-condition-traps': 'continuous',
  'edge-batching-without-period': 'unknown',
  'edge-read-only-stop-conditions': 'continuous',
  'invalid-incomplete-stop-conditions': 'invalid',
};

const memberNodes = (yaml: string) =>
  parsePipelineFlowTree(yaml).nodes.filter((n) => n.section === 'input' && n.parentId === 'input-broker');

describe('the Connect config fixtures', () => {
  test('ids are unique, and every fixture but the malformed one parses', () => {
    expect(new Set(CONNECT_CONFIG_FIXTURES.map((f) => f.id)).size).toBe(CONNECT_CONFIG_FIXTURES.length);
    for (const fixture of CONNECT_CONFIG_FIXTURES.filter((f) => f.id !== 'invalid-malformed-yaml')) {
      expect(() => parseYaml(fixture.yaml, { merge: true })).not.toThrow();
    }
  });

  test('each stop-condition fixture ends as it says', () => {
    const tagged = CONNECT_CONFIG_FIXTURES.filter((f) => f.tags.includes('stops')).map((f) => f.id);
    expect(tagged.sort()).toEqual(Object.keys(EXPECTED_END).sort());
    for (const [id, status] of Object.entries(EXPECTED_END)) {
      expect([id, summarizePipelineEndYaml(yamlOf(id)).status]).toEqual([id, status]);
    }
  });

  test('a check alone warns it can wait forever', () => {
    expect(summarizePipelineEndYaml(yamlOf('stops-end-of-batch-check')).behavior?.caveat).toContain('idle timeout');
  });

  test('every trap never stops', () => {
    expect(memberNodes(yamlOf('edge-stop-condition-traps')).map((n) => n.endBehavior?.kind)).toEqual([
      'continuous',
      'continuous',
      'continuous',
      'continuous',
    ]);
  });

  test('a stop condition around the broker sits on the broker, beside a member’s own', () => {
    const { nodes } = parsePipelineFlowTree(yamlOf('stops-broker-own-condition'));
    expect(nodes.find((n) => n.id === 'input-broker')?.stopSlot?.condition).toEqual({
      check: 'counter() >= 50000',
      idleTimeout: '2m',
    });
    expect(memberNodes(yamlOf('stops-broker-own-condition')).map((n) => n.stopSlot?.condition)).toEqual([
      undefined,
      undefined,
      { idleTimeout: '10m' },
    ]);
  });

  test('the aliased and env-var members are read-only', () => {
    const locked = memberNodes(yamlOf('edge-read-only-stop-conditions')).map((n) => Boolean(n.stopSlot?.locked));
    expect(locked).toEqual([false, true, false, true, true]);
  });

  test('the incomplete stop conditions are reported locally', () => {
    expect(localStopConditionLintHints(yamlOf('invalid-incomplete-stop-conditions')).map((h) => h.hint)).toEqual([
      'read_until needs a check or an idle_timeout to know when to stop.',
      'idle_timeout must be a duration such as 30s, 5m or 1h.',
      'read_until needs an input to read from.',
    ]);
  });
});
