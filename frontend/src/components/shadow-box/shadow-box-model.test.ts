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
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  ClusterFenceSchema,
  ClusterFenceState,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import {
  type BrokerProgress,
  canBoxFromPhase,
  describeBoxPhase,
  describeHeldMove,
  formatBoxDuration,
  getBrokerProgress,
  getClientEffects,
  getReadPolicyWarnings,
  hasBoxActivity,
  isApplyingNewSettings,
  isBlockingPhase,
  isLongBox,
  LONG_BOX_THRESHOLD_MS,
  linkCanRead,
  linksThatStopBox,
  summarizeBox,
  toBoxPhase,
} from './shadow-box-model';
import { describe, expect, test } from 'bun:test';

const NOW = Date.parse('2026-10-19T12:00:00Z');

const box = (state: ClusterFenceState, revision: number) =>
  create(ClusterFenceSchema, { state, revision: BigInt(revision) });

describe('toBoxPhase', () => {
  test('maps the four states, and leaves an unset or unknown one undefined rather than calling it unfenced', () => {
    expect(toBoxPhase(ClusterFenceState.UNFENCED)).toBe('unboxed');
    expect(toBoxPhase(ClusterFenceState.FENCING)).toBe('boxing');
    expect(toBoxPhase(ClusterFenceState.FENCED)).toBe('boxed');
    expect(toBoxPhase(ClusterFenceState.UNFENCING)).toBe('unboxing');
    expect(toBoxPhase(ClusterFenceState.UNSPECIFIED)).toBeUndefined();
    expect(toBoxPhase(undefined)).toBeUndefined();
  });
});

describe('phase rules', () => {
  test('blocking begins in fencing, not fenced, and stops in unfencing', () => {
    expect(['unboxed', 'boxing', 'boxed', 'unboxing'].filter((phase) => isBlockingPhase(phase as never))).toEqual([
      'boxing',
      'boxed',
    ]);
    expect(hasBoxActivity('unboxing')).toBe(true);
    expect(hasBoxActivity('unboxed')).toBe(false);
  });

  test('a Fence is accepted while unfenced or unfencing; a Fence while fencing or fenced changes nothing', () => {
    expect(canBoxFromPhase('unboxed')).toBe(true);
    expect(canBoxFromPhase('unboxing')).toBe(true);
    expect(canBoxFromPhase('boxing')).toBe(false);
    expect(canBoxFromPhase('boxed')).toBe(false);
  });
});

describe('getBrokerProgress', () => {
  test('a broker has confirmed only when its copy matches the cluster’s fence in state and revision', () => {
    const response = create(GetClusterFenceStatusResponseSchema, {
      fence: box(ClusterFenceState.FENCING, 18),
      brokers: [
        { nodeId: 1, fence: box(ClusterFenceState.FENCING, 18) },
        { nodeId: 2, errorMessage: 'rpc::errc::disconnected_endpoint(node down)' },
        { nodeId: 3, fence: box(ClusterFenceState.UNFENCED, -1) },
        { nodeId: 4, fence: box(ClusterFenceState.FENCED, 18) },
      ],
    });
    expect(getBrokerProgress(response)).toEqual([
      { nodeId: 1, status: 'confirmed', copy: { phase: 'boxing', revision: 18n }, blocks: true },
      {
        nodeId: 2,
        status: 'not-answering',
        blocks: undefined,
        errorMessage: 'rpc::errc::disconnected_endpoint(node down)',
      },
      { nodeId: 3, status: 'behind', copy: { phase: 'unboxed', revision: -1n }, blocks: false },
      { nodeId: 4, status: 'behind', copy: { phase: 'boxed', revision: 18n }, blocks: true },
    ]);
  });

  test('is empty before a status loads', () => {
    expect(getBrokerProgress(undefined)).toEqual([]);
  });
});

describe('summarizeBox', () => {
  test('reads the phase, revision, time in state and saved settings', () => {
    const changedAt = new Date(NOW - 60_000);
    expect(
      summarizeBox(
        create(ClusterFenceSchema, {
          state: ClusterFenceState.FENCED,
          revision: 29n,
          stateChangedAt: timestampFromDate(changedAt),
          settings: {
            readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads: false },
          },
        })
      )
    ).toEqual({
      phase: 'boxed',
      revision: 29n,
      stateChangedAt: changedAt,
      exemptPrincipals: ['shadow-orders'],
      allowAllReads: false,
    });
  });

  test('a missing fence or an unknown state isn’t read as unfenced', () => {
    expect(summarizeBox(undefined)).toBeUndefined();
    expect(summarizeBox(create(ClusterFenceSchema, {}))).toBeUndefined();
  });
});

const progress = (...entries: [number, BrokerProgress['status'], boolean | undefined][]): BrokerProgress[] =>
  entries.map(([nodeId, status, blocks]) => ({ nodeId, status, blocks }));

describe('describeBoxPhase', () => {
  test('says each broker blocks as soon as it picks up the fence, with the count so far', () => {
    expect(describeBoxPhase({ phase: 'boxing' }, progress([1, 'confirmed', true], [2, 'behind', false]))).toBe(
      'Fencing. Each broker rejects writes as soon as it picks up the fence. 1 of 2 have.'
    );
  });

  test('tells a settings change while fenced apart from a first Fence: writes stay blocked', () => {
    const brokers = progress([1, 'confirmed', true], [2, 'behind', true]);
    expect(isApplyingNewSettings({ phase: 'boxing' }, brokers)).toBe(true);
    expect(describeBoxPhase({ phase: 'boxing' }, brokers)).toContain('Writes stay blocked on every broker');
  });

  test('describes each settled phase', () => {
    expect(describeBoxPhase({ phase: 'boxed' }, [])).toBe('Fenced. Every broker rejects writes.');
    expect(describeBoxPhase({ phase: 'unboxed' }, [])).toContain('as usual');
    expect(describeBoxPhase({ phase: 'unboxing' }, [])).toContain('accepts writes again');
  });
});

describe('describeHeldMove', () => {
  test('a broker that isn’t answering holds a move with no timeout', () => {
    const held = describeHeldMove(
      { phase: 'boxing', stateChangedAt: new Date(NOW) },
      progress([1, 'confirmed', true], [2, 'not-answering', undefined]),
      NOW
    );
    expect(held).toBe(
      'Broker 2 isn’t answering, so the cluster stays fencing until it comes back or leaves the cluster. There’s no timeout.'
    );
  });

  test('a broker that answers but is behind is only named once the move is old enough to mention', () => {
    const brokers = progress([1, 'confirmed', true], [3, 'behind', false]);
    expect(describeHeldMove({ phase: 'boxing', stateChangedAt: new Date(NOW - 5000) }, brokers, NOW)).toBe('');
    expect(describeHeldMove({ phase: 'boxing', stateChangedAt: new Date(NOW - 60_000) }, brokers, NOW)).toBe(
      'Broker 3 hasn’t picked up the change yet.'
    );
  });
});

describe('formatBoxDuration', () => {
  test.each([
    [20 * 1000, 'less than a minute'],
    [12 * 60 * 1000, '12 min'],
    [3 * 60 * 60 * 1000, '3 h'],
    [(2 * 60 + 14) * 60 * 1000, '2 h 14 min'],
    [24 * 60 * 60 * 1000, '1 day'],
    [9 * 24 * 60 * 60 * 1000, '9 days'],
  ])('%i ms reads as %s', (elapsed, label) => {
    expect(formatBoxDuration(elapsed)).toBe(label);
  });
});

describe('isLongBox', () => {
  test('only a settled fence held past the threshold counts', () => {
    const boxedFor = (ms: number) => ({ phase: 'boxed' as const, stateChangedAt: new Date(NOW - ms) });
    expect(isLongBox(boxedFor(LONG_BOX_THRESHOLD_MS - 1), NOW)).toBe(false);
    expect(isLongBox(boxedFor(LONG_BOX_THRESHOLD_MS), NOW)).toBe(true);
    expect(isLongBox({ phase: 'boxing', stateChangedAt: new Date(NOW - 2 * LONG_BOX_THRESHOLD_MS) }, NOW)).toBe(false);
  });
});

describe('linkCanRead', () => {
  const policy = (exemptPrincipals: string[], allowAllReads = false) => ({ exemptPrincipals, allowAllReads });

  test('names are bare user names, matched exactly; superusers get no pass', () => {
    expect(linkCanRead(policy(['shadow-orders']), { authentication: 'sasl', principal: 'shadow-orders' })).toBe(true);
    expect(linkCanRead(policy(['User:shadow-orders']), { authentication: 'sasl', principal: 'shadow-orders' })).toBe(
      false
    );
    expect(linkCanRead(policy([]), { authentication: 'sasl', principal: 'admin' })).toBe(false);
  });

  test('an empty list blocks every link, even one Console can’t otherwise judge', () => {
    expect(linkCanRead(policy([]), { authentication: 'mtls' })).toBe(false);
    expect(linkCanRead(policy(['ops']), { authentication: 'mtls' })).toBeUndefined();
  });

  test('an empty name matches clients without SASL or mTLS; allow all reads lets everyone read', () => {
    expect(linkCanRead(policy(['']), { authentication: 'none' })).toBe(true);
    expect(linkCanRead(policy(['shadow-orders']), { authentication: 'none' })).toBe(false);
    expect(linkCanRead(policy([], true), { authentication: 'none' })).toBe(true);
  });

  test('can’t tell for an mTLS link, whose user comes from the mapping rules', () => {
    expect(linkCanRead(policy(['shadow-orders']), { authentication: 'mtls' })).toBeUndefined();
  });
});

describe('getReadPolicyWarnings', () => {
  test('the default empty list locks out every shadow link, louder than anything else', () => {
    expect(getReadPolicyWarnings([], false)).toEqual([
      expect.objectContaining({
        id: 'empty',
        severity: 'danger',
        message: expect.stringContaining('every shadow link'),
      }),
    ]);
  });

  test('a User: name matches nobody, with a fix to the bare name', () => {
    const [warning] = getReadPolicyWarnings(['User:alice', 'bob'], false);
    expect(warning).toMatchObject({ severity: 'warning', message: expect.stringContaining('matches nobody') });
    expect(warning?.fix?.principals(['User:alice', 'bob'])).toEqual(['alice', 'bob']);
  });

  test('explains the empty name, and says nothing when every reader is allowed', () => {
    expect(getReadPolicyWarnings(['', 'shadow-orders'], false).map((warning) => warning.id)).toEqual(['blank']);
    expect(getReadPolicyWarnings([], true)).toEqual([]);
  });
});

describe('linksThatStopBox', () => {
  test('a link that has failed over no longer makes its cluster a shadow', () => {
    const links = [
      { name: 'active', state: ShadowLinkState.ACTIVE },
      { name: 'done', state: ShadowLinkState.FAILED_OVER },
      { name: 'moving', state: ShadowLinkState.FAILING_OVER },
    ];
    expect(linksThatStopBox(links).map((link) => link.name)).toEqual(['active', 'moving']);
  });
});

describe('getClientEffects', () => {
  const settings = { exemptPrincipals: ['shadow-orders'], allowAllReads: false };
  const verdicts = (effects: ReturnType<typeof getClientEffects>) =>
    Object.fromEntries(effects.map((effect) => [effect.id, effect.verdict]));

  test('unfenced, everything is allowed and transactions stay open', () => {
    expect(verdicts(getClientEffects({ summary: { ...settings, phase: 'unboxed' }, brokers: [] }))).toMatchObject({
      produce: 'allowed',
      consume: 'allowed',
      commit: 'allowed',
      schema: 'allowed',
      transaction: 'open',
    });
  });

  test('fenced, writes are rejected with what the client sees, exempt links read, and transactions end', () => {
    const effects = getClientEffects({
      summary: { ...settings, phase: 'boxed' },
      brokers: progress([1, 'confirmed', true]),
      links: [
        { linkName: 'orders-dr', authentication: 'sasl', principal: 'shadow-orders' },
        { linkName: 'audit-dr', authentication: 'sasl', principal: 'shadow-audit' },
        { linkName: 'mtls-dr', authentication: 'mtls' },
      ],
    });
    expect(verdicts(effects)).toMatchObject({
      produce: 'rejected',
      consume: 'rejected',
      'link-orders-dr': 'allowed',
      'link-audit-dr': 'rejected',
      'link-mtls-dr': 'unknown',
      schema: 'rejected',
      transaction: 'ended',
    });
    expect(effects.find((effect) => effect.id === 'produce')?.detail).toContain('REQUEST_TIMED_OUT (7)');
    expect(effects.find((effect) => effect.id === 'schema')?.detail).toContain('HTTP 412');
  });

  test('part way through a first Fence, only the brokers that picked it up reject', () => {
    const [produce] = getClientEffects({
      summary: { ...settings, phase: 'boxing' },
      brokers: progress([1, 'confirmed', true], [2, 'confirmed', true], [3, 'behind', false]),
    });
    expect(produce).toMatchObject({ verdict: 'partly', detail: expect.stringContaining('Still allowed on broker 3') });
  });

  test('once fenced, open transactions always end', () => {
    const effects = getClientEffects({
      summary: { ...settings, phase: 'boxed' },
      brokers: [],
    });
    expect(effects.find((effect) => effect.id === 'transaction')).toMatchObject({ verdict: 'ended' });
  });

  test('part way through a first Fence, brokers that picked it up already end open transactions', () => {
    const effects = getClientEffects({
      summary: { ...settings, phase: 'boxing' },
      brokers: progress([1, 'confirmed', true], [2, 'behind', false]),
    });
    expect(effects.find((effect) => effect.id === 'transaction')).toMatchObject({
      verdict: 'partly',
      detail: expect.stringContaining('Ended on broker 1'),
    });
  });
});
