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
  canFenceFromPhase,
  describeFencePhase,
  describeHeldMove,
  formatFenceDuration,
  getBrokerProgress,
  getClientEffects,
  getReadPolicyWarnings,
  isApplyingNewSettings,
  isBlockingPhase,
  linkCanRead,
  linksThatStopFence,
  summarizeFence,
  toExemptName,
  toFencePhase,
} from './cluster-fence-model';
import { describe, expect, test } from 'bun:test';

const NOW = Date.parse('2026-10-19T12:00:00Z');

const fence = (state: ClusterFenceState, revision: number) =>
  create(ClusterFenceSchema, { state, revision: BigInt(revision) });

describe('toFencePhase', () => {
  test('maps the four states, and leaves an unset or unknown one undefined rather than calling it unfenced', () => {
    expect(toFencePhase(ClusterFenceState.UNFENCED)).toBe('unfenced');
    expect(toFencePhase(ClusterFenceState.FENCING)).toBe('fencing');
    expect(toFencePhase(ClusterFenceState.FENCED)).toBe('fenced');
    expect(toFencePhase(ClusterFenceState.UNFENCING)).toBe('unfencing');
    expect(toFencePhase(ClusterFenceState.UNSPECIFIED)).toBeUndefined();
    expect(toFencePhase(undefined)).toBeUndefined();
  });
});

test('blocking begins in fencing, not fenced, and stops in unfencing; Fence is accepted from the other two', () => {
  const phases = ['unfenced', 'fencing', 'fenced', 'unfencing'] as const;
  expect(phases.filter(isBlockingPhase)).toStrictEqual(['fencing', 'fenced']);
  expect(phases.filter(canFenceFromPhase)).toStrictEqual(['unfenced', 'unfencing']);
});

describe('getBrokerProgress', () => {
  test('a broker has confirmed only when its copy matches the cluster’s fence in state and revision', () => {
    const response = create(GetClusterFenceStatusResponseSchema, {
      fence: fence(ClusterFenceState.FENCING, 18),
      brokers: [
        { nodeId: 1, fence: fence(ClusterFenceState.FENCING, 18) },
        { nodeId: 2, errorMessage: 'rpc::errc::disconnected_endpoint(node down)' },
        { nodeId: 3, fence: fence(ClusterFenceState.UNFENCED, -1) },
        { nodeId: 4, fence: fence(ClusterFenceState.FENCED, 18) },
      ],
    });
    expect(getBrokerProgress(response)).toStrictEqual([
      { nodeId: 1, status: 'confirmed', copy: { phase: 'fencing', revision: 18n }, blocks: true },
      {
        nodeId: 2,
        status: 'not-answering',
        blocks: undefined,
        errorMessage: 'rpc::errc::disconnected_endpoint(node down)',
      },
      { nodeId: 3, status: 'behind', copy: { phase: 'unfenced', revision: -1n }, blocks: false },
      { nodeId: 4, status: 'behind', copy: { phase: 'fenced', revision: 18n }, blocks: true },
    ]);
  });

  test('keeps the read policy each broker enforces, which a settings change reaches one broker at a time', () => {
    const withReads = (revision: number, allowAllReads: boolean) =>
      create(ClusterFenceSchema, {
        state: ClusterFenceState.FENCED,
        revision: BigInt(revision),
        settings: { readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads } },
      });
    const [current, earlier] = getBrokerProgress(
      create(GetClusterFenceStatusResponseSchema, {
        fence: withReads(19, true),
        brokers: [
          { nodeId: 1, fence: withReads(19, true) },
          { nodeId: 2, fence: withReads(18, false) },
        ],
      })
    );
    expect(current?.copy?.readPolicy).toStrictEqual({ exemptPrincipals: ['shadow-orders'], allowAllReads: true });
    expect(earlier?.copy?.readPolicy).toStrictEqual({ exemptPrincipals: ['shadow-orders'], allowAllReads: false });
  });
});

describe('summarizeFence', () => {
  test('reads the phase, revision, time in state and saved settings', () => {
    const changedAt = new Date(NOW - 60_000);
    expect(
      summarizeFence(
        create(ClusterFenceSchema, {
          state: ClusterFenceState.FENCED,
          revision: 29n,
          stateChangedAt: timestampFromDate(changedAt),
          settings: {
            readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads: false },
          },
        })
      )
    ).toStrictEqual({
      phase: 'fenced',
      revision: 29n,
      stateChangedAt: changedAt,
      exemptPrincipals: ['shadow-orders'],
      allowAllReads: false,
    });
  });

  test('a missing fence or an unknown state isn’t read as unfenced', () => {
    expect(summarizeFence(undefined)).toBeUndefined();
    expect(summarizeFence(create(ClusterFenceSchema, {}))).toBeUndefined();
  });
});

const progress = (...entries: [number, BrokerProgress['status'], boolean | undefined][]): BrokerProgress[] =>
  entries.map(([nodeId, status, blocks]) => ({ nodeId, status, blocks }));

describe('describeFencePhase', () => {
  test('says each broker blocks writes and reads as soon as the fence reaches it, without naming the phase', () => {
    const brokers = progress([1, 'confirmed', true], [2, 'behind', false]);
    expect(describeFencePhase({ phase: 'fencing', allowAllReads: false }, brokers)).toBe(
      'Each broker rejects writes as soon as the fence reaches it. Only exempt users can read from user topics.'
    );
    expect(describeFencePhase({ phase: 'fenced', allowAllReads: true }, brokers)).toBe(
      'Every broker rejects writes. Consumers can still read.'
    );
  });

  test('tells a settings change while fenced apart from a first Fence: writes stay blocked', () => {
    const brokers = progress([1, 'confirmed', true], [2, 'behind', true]);
    expect(isApplyingNewSettings({ phase: 'fencing' }, brokers)).toBe(true);
    expect(describeFencePhase({ phase: 'fencing', allowAllReads: false }, brokers)).toContain(
      'Writes stay blocked on every broker'
    );
  });

  test('a Fence sent while unfencing isn’t a settings change: brokers that picked up Unfence still accept writes', () => {
    const brokers = progress([1, 'behind', false], [2, 'behind', true]);
    expect(isApplyingNewSettings({ phase: 'fencing' }, brokers)).toBe(false);
  });
});

describe('describeHeldMove', () => {
  test('a broker that isn’t answering holds a move with no timeout', () => {
    const held = describeHeldMove(
      { phase: 'fencing', stateChangedAt: new Date(NOW) },
      progress([1, 'confirmed', true], [2, 'not-answering', undefined]),
      NOW
    );
    expect(held).toBe(
      'Broker 2 isn’t answering, so the cluster stays fencing until it comes back or leaves the cluster. There’s no timeout.'
    );
  });

  test('a broker that answers but is behind is only named once the move is old enough to mention', () => {
    const brokers = progress([1, 'confirmed', true], [3, 'behind', false]);
    expect(describeHeldMove({ phase: 'fencing', stateChangedAt: new Date(NOW - 5000) }, brokers, NOW)).toBe('');
    expect(describeHeldMove({ phase: 'fencing', stateChangedAt: new Date(NOW - 60_000) }, brokers, NOW)).toBe(
      'The change hasn’t reached broker 3 yet.'
    );
  });
});

describe('formatFenceDuration', () => {
  test.each([
    [20 * 1000, 'less than a minute'],
    [12 * 60 * 1000, '12 min'],
    [3 * 60 * 60 * 1000, '3 h'],
    [(2 * 60 + 14) * 60 * 1000, '2 h 14 min'],
    [24 * 60 * 60 * 1000, '1 day'],
    [9 * 24 * 60 * 60 * 1000, '9 days'],
  ])('%i ms reads as %s', (elapsed, label) => {
    expect(formatFenceDuration(elapsed)).toBe(label);
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
});

test('toExemptName trims a principal and drops a User: prefix', () => {
  expect(toExemptName(' User:shadow-orders ')).toBe('shadow-orders');
  expect(toExemptName('shadow-orders')).toBe('shadow-orders');
});

describe('getReadPolicyWarnings', () => {
  test('the default empty list locks out every shadow link, louder than anything else', () => {
    const warnings = getReadPolicyWarnings([], false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ id: 'empty', severity: 'danger' });
    expect(warnings[0]?.message).toContain('every shadow link');
  });

  test('a User: name matches nobody, with a fix to the bare name', () => {
    const [warning] = getReadPolicyWarnings(['User:alice', 'bob'], false);
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('matches nobody');
    expect(warning?.fix?.principals(['User:alice', 'bob'])).toStrictEqual(['alice', 'bob']);
  });

  test('explains the empty name, and says nothing when every reader is allowed', () => {
    expect(getReadPolicyWarnings(['', 'shadow-orders'], false).map((warning) => warning.id)).toStrictEqual(['blank']);
    expect(getReadPolicyWarnings([], true)).toStrictEqual([]);
  });
});

describe('linksThatStopFence', () => {
  test('a link that has failed over no longer makes its cluster a shadow', () => {
    const links = [
      { name: 'active', state: ShadowLinkState.ACTIVE },
      { name: 'done', state: ShadowLinkState.FAILED_OVER },
      { name: 'moving', state: ShadowLinkState.FAILING_OVER },
    ];
    expect(linksThatStopFence(links).map((link) => link.name)).toStrictEqual(['active', 'moving']);
  });
});

describe('getClientEffects', () => {
  const settings = { exemptPrincipals: ['shadow-orders'], allowAllReads: false };
  const verdicts = (effects: ReturnType<typeof getClientEffects>) =>
    Object.fromEntries(effects.map((effect) => [effect.id, effect.verdict]));

  test('unfenced, everything is allowed and transactions stay open', () => {
    expect(verdicts(getClientEffects({ summary: { ...settings, phase: 'unfenced' }, brokers: [] }))).toMatchObject({
      produce: 'allowed',
      consume: 'allowed',
      commit: 'allowed',
      schema: 'allowed',
      transaction: 'open',
    });
  });

  test('fenced, writes are rejected, exempt links read, and transactions end', () => {
    const effects = getClientEffects({
      summary: { ...settings, phase: 'fenced' },
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
    /** The error codes clients get are cluster settings, so the details don't name them. */
    expect(effects.find((effect) => effect.id === 'produce')?.detail).toBe('Rejected.');
    expect(effects.find((effect) => effect.id === 'schema')?.detail).toBe('Rejected.');
  });

  test('without the links that read from the cluster, the reminder about a link’s user comes last', () => {
    const effects = getClientEffects({ summary: { ...settings, phase: 'fenced' }, brokers: [] });
    expect(effects.at(-1)).toMatchObject({ id: 'link', verdict: 'unknown' });
  });

  test('part way through a first Fence, only the brokers that picked it up reject', () => {
    const [produce] = getClientEffects({
      summary: { ...settings, phase: 'fencing' },
      brokers: progress([1, 'confirmed', true], [2, 'confirmed', true], [3, 'behind', false]),
    });
    expect(produce?.verdict).toBe('partly');
    expect(produce?.detail).toContain('Still allowed on broker 3');
  });

  test('part way through a first Fence, brokers that picked it up already end open transactions', () => {
    const effects = getClientEffects({
      summary: { ...settings, phase: 'fencing' },
      brokers: progress([1, 'confirmed', true], [2, 'behind', false]),
    });
    const transaction = effects.find((effect) => effect.id === 'transaction');
    expect(transaction?.verdict).toBe('partly');
    expect(transaction?.detail).toContain('Ended on broker 1');
  });

  describe('while new read settings reach the brokers, each broker reads by the settings it has', () => {
    /** Broker 1 has the new settings; broker 2 is still fenced on the earlier ones. */
    const settingsChange = (earlier: Partial<typeof settings>, now: Partial<typeof settings>) => {
      const fenced = (nodeId: number, readPolicy: typeof settings): BrokerProgress => ({
        nodeId,
        status: nodeId === 1 ? 'confirmed' : 'behind',
        copy: { phase: nodeId === 1 ? 'fencing' : 'fenced', revision: nodeId === 1 ? 19n : 18n, readPolicy },
        blocks: true,
      });
      const policy = { ...settings, ...now };
      return getClientEffects({
        summary: { ...policy, phase: 'fencing' },
        brokers: [fenced(1, policy), fenced(2, { ...settings, ...earlier })],
        links: [{ linkName: 'orders-dr', authentication: 'sasl', principal: 'shadow-orders' }],
      });
    };
    const effect = (effects: ReturnType<typeof getClientEffects>, id: string) =>
      effects.find((candidate) => candidate.id === id);

    test('turning on Allow all reads lets consumers read only where it has arrived', () => {
      expect(effect(settingsChange({ allowAllReads: false }, { allowAllReads: true }), 'consume')).toMatchObject({
        verdict: 'partly',
        detail: 'Allowed on broker 1. Still rejected on broker 2 until the new settings reach it.',
      });
    });

    test('turning off Allow all reads still lets consumers read where it hasn’t arrived', () => {
      expect(effect(settingsChange({ allowAllReads: true }, { allowAllReads: false }), 'consume')).toMatchObject({
        verdict: 'partly',
        detail: 'Rejected on broker 1. Still allowed on broker 2 until the new settings reach it.',
      });
    });

    test('a link’s user just exempted still can’t read where the exemption hasn’t arrived', () => {
      const effects = settingsChange({ exemptPrincipals: ['shadow-audit'] }, { exemptPrincipals: ['shadow-orders'] });
      expect(effect(effects, 'link-orders-dr')).toMatchObject({
        verdict: 'partly',
        detail: 'Allowed on broker 1. Still rejected on broker 2 until the new settings reach it.',
      });
    });

    test('a link’s user just removed from the list can still read where that hasn’t arrived', () => {
      const effects = settingsChange({ exemptPrincipals: ['shadow-orders'] }, { exemptPrincipals: ['shadow-audit'] });
      expect(effect(effects, 'link-orders-dr')).toMatchObject({
        verdict: 'partly',
        detail: 'Rejected on broker 1. Still allowed on broker 2 until the new settings reach it.',
      });
    });

    test('once every broker has them, reads go by the new settings alone', () => {
      expect(effect(settingsChange({ allowAllReads: true }, { allowAllReads: true }), 'consume')).toMatchObject({
        verdict: 'allowed',
        detail: 'Allowed: Allow all reads is on.',
      });
    });
  });

  test('part way through Unfence, brokers that picked it up allow writes again', () => {
    const [produce] = getClientEffects({
      summary: { ...settings, phase: 'unfencing' },
      brokers: progress([1, 'confirmed', false], [2, 'behind', true]),
    });
    expect(produce?.detail).toBe('Allowed again on broker 1. Still rejected on broker 2 until the change reaches it.');
  });
});
