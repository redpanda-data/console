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

import type { LinkIdentity } from 'components/cluster-fence/cluster-fence-model';
import type { ShadowLinkPeerFenceState, ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import {
  type FailoverTopic,
  getFailoverReadiness,
  getFailoverStepStates,
  getLagStep,
  getLinkIdentity,
  getSourceFenceStep,
  type SourceFenceStep,
} from './failover-model';
import { describe, expect, test } from 'bun:test';
import type { UnifiedShadowLink } from '../model';

const cloudSource = (state: ShadowLinkPeerFenceState, exemptPrincipals = ['shadow-orders']): ShadowLinkSource => ({
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod-us-east-1',
  fence: {
    status: 'known',
    state,
    revision: '18',
    exemptPrincipals,
    allowAllReads: false,
    brokers: [],
  },
});

const sasl: LinkIdentity = { authentication: 'sasl', principal: 'shadow-orders' };

const step = (source: ShadowLinkSource, link: LinkIdentity = sasl): SourceFenceStep => {
  const result = getSourceFenceStep({ source, link, resolving: false });
  if (!result) {
    throw new Error('No guided failover for this source');
  }
  return result;
};

const topic = (topicName: string, totalLag: number, state = ShadowTopicState.ACTIVE): FailoverTopic => ({
  topicName,
  state,
  totalLag: BigInt(totalLag),
});

const caughtUp = [topic('orders-events', 0), topic('orders-audit', 0)];

describe('getSourceFenceStep', () => {
  test('reads a Cloud source’s fence and whether its saved settings let this link fetch, in any phase', () => {
    expect(step(cloudSource('fenced'))).toMatchObject({ kind: 'cloud', fenced: true, linkExempt: true });
    expect(step(cloudSource('unfenced', []))).toMatchObject({ fenced: false, linkExempt: false });
    expect(step(cloudSource('fenced', ['User:shadow-orders']))).toMatchObject({ linkExempt: false });
  });

  test('has no guided failover without a source, or for one outside Cloud', () => {
    expect(getSourceFenceStep({ source: undefined, link: sasl, resolving: false })).toBeUndefined();
    expect(
      getSourceFenceStep({
        source: { kind: 'external', bootstrapServers: ['kafka:9092'] },
        link: sasl,
        resolving: false,
      })
    ).toBeUndefined();
  });

  describe('once the fence has been read in this visit', () => {
    const lastKnown = cloudSource('fenced') as Extract<ShadowLinkSource, { kind: 'cloud' }>;
    const unavailable = (reason: 'no-leader' | 'not-running' | 'error' | 'unsupported' | 'inactive' | 'forbidden') =>
      getSourceFenceStep({
        source: {
          kind: 'cloud',
          clusterId: 'prod',
          clusterName: 'prod-us-east-1',
          fence: { status: 'unavailable', reason },
        },
        link: sasl,
        resolving: false,
        lastKnown,
      });

    test('a passing read failure keeps the guided failover, as unreadable', () => {
      for (const reason of ['no-leader', 'not-running', 'error'] as const) {
        expect(unavailable(reason)).toMatchObject({ kind: 'unreadable', reason, source: { clusterId: 'prod' } });
      }
      expect(getSourceFenceStep({ source: undefined, link: sasl, resolving: false, lastKnown })).toMatchObject({
        kind: 'unreadable',
        source: { clusterName: 'prod-us-east-1' },
      });
    });

    test('a source that can’t be fenced, or that the viewer can’t read, still ends it', () => {
      for (const reason of ['unsupported', 'inactive', 'forbidden'] as const) {
        expect(unavailable(reason)).toBeUndefined();
      }
    });

    test('an unreadable source isn’t ready, and says why', () => {
      const fence = unavailable('no-leader');
      if (!fence) {
        throw new Error('expected an unreadable step');
      }
      expect(getFailoverReadiness({ topics: caughtUp, fence }).failover).toMatchObject({
        ready: false,
        reason: 'Not ready until Console can read the source’s fence again.',
      });
    });
  });

  test('a source that was never read in this visit has no guided failover, even if the failure passes', () => {
    expect(
      getSourceFenceStep({
        source: {
          kind: 'cloud',
          clusterId: 'prod',
          clusterName: 'prod',
          fence: { status: 'unavailable', reason: 'no-leader' },
        },
        link: sasl,
        resolving: false,
      })
    ).toBeUndefined();
  });

  test('waits while the host resolves links or reads the source’s fence', () => {
    expect(getSourceFenceStep({ source: undefined, link: sasl, resolving: true })).toEqual({
      kind: 'loading',
      source: undefined,
    });
    expect(
      getSourceFenceStep({
        source: { kind: 'cloud', clusterId: 'prod', clusterName: 'prod', fence: { status: 'loading' } },
        link: sasl,
        resolving: false,
      })
    ).toMatchObject({ kind: 'loading', source: { clusterId: 'prod' } });
    expect(
      getSourceFenceStep({
        source: { kind: 'external', bootstrapServers: ['kafka:9092'] },
        link: sasl,
        resolving: true,
      })
    ).toBeUndefined();
  });
});

describe('getLagStep', () => {
  test('lag only counts as drained once the source is fenced', () => {
    expect(getLagStep(caughtUp, 'ready').status).toBe('caught-up');
    expect(getLagStep(caughtUp, 'waiting').status).toBe('waiting-for-fence');
  });

  test('lists the topics still behind, worst first', () => {
    const lag = getLagStep([topic('a', 3), topic('b', 1204), topic('c', 0)], 'ready');
    expect(lag).toMatchObject({ status: 'draining', syncing: 3, caughtUp: 1 });
    expect(lag.behind.map((entry) => entry.topicName)).toEqual(['b', 'a']);
  });

  test('reports paused and faulted topics, and a faulted one means the link hasn’t caught up', () => {
    const lag = getLagStep([topic('a', 0, ShadowTopicState.PAUSED), topic('b', 0, ShadowTopicState.FAULTED)], 'ready');
    expect(lag).toMatchObject({ status: 'faulted', paused: ['a'], faulted: ['b'] });
  });

  test('says nothing about lag until the topics load', () => {
    expect(getLagStep(undefined, 'ready')).toMatchObject({ status: 'loading', behind: [] });
    expect(getLagStep(undefined, 'ready', true).status).toBe('unavailable');
  });
});

describe('getFailoverReadiness', () => {
  const fencedStep = step(cloudSource('fenced'));

  test('unlocks failover once the source is fenced and lag is zero', () => {
    expect(getFailoverReadiness({ topics: caughtUp, fence: fencedStep }).failover).toEqual({
      done: false,
      inProgress: 0,
      ready: true,
      reason: undefined,
    });
  });

  test('a fence that blocks this link’s reads isn’t ready, because the link can’t finish copying', () => {
    const readiness = getFailoverReadiness({ topics: caughtUp, fence: step(cloudSource('fenced', ['someone-else'])) });

    expect(readiness.lag.status).toBe('blocked');
    expect(readiness.failover).toMatchObject({
      ready: false,
      reason: expect.stringContaining('lets this link read'),
    });
    expect(getFailoverStepStates(readiness)).toMatchObject({
      settings: 'attention',
      fence: 'done',
      fenced: 'done',
      failover: 'pending',
    });
  });

  test('a failed refresh keeps the last lag but won’t call it caught up', () => {
    const readiness = getFailoverReadiness({ topics: caughtUp, topicsFailed: true, fence: fencedStep });

    expect(readiness.lag).toMatchObject({ status: 'caught-up', stale: true, caughtUp: 2 });
    expect(readiness.failover).toMatchObject({ ready: false, reason: expect.stringContaining('Couldn’t refresh') });
    expect(getFailoverStepStates(readiness)).toMatchObject({ lag: 'current', failover: 'pending' });
  });

  test('isn’t done while topics are still failing over', () => {
    const readiness = getFailoverReadiness({
      topics: [topic('a', 0, ShadowTopicState.FAILED_OVER), topic('b', 0, ShadowTopicState.FAILING_OVER)],
      fence: fencedStep,
    });

    expect(readiness.failover).toEqual({
      done: false,
      inProgress: 1,
      ready: false,
      reason: 'Failing over 1 topic…',
    });
  });

  test('isn’t ready, with a reason, until then', () => {
    expect(getFailoverReadiness({ topics: caughtUp, fence: step(cloudSource('unfenced')) }).failover.reason).toBe(
      'Not ready until the source cluster reports Fenced.'
    );
    expect(getFailoverReadiness({ topics: [topic('a', 5)], fence: fencedStep }).failover.reason).toBe(
      'Not ready until every topic has zero lag.'
    );
    expect(getFailoverReadiness({ topics: undefined, fence: fencedStep }).failover.reason).toBe(
      'Loading the link’s topics.'
    );
    expect(getFailoverReadiness({ topics: undefined, topicsFailed: true, fence: fencedStep }).failover.reason).toBe(
      'Couldn’t load the link’s topics, so Console can’t check their lag.'
    );
    expect(
      getFailoverReadiness({ topics: [topic('a', 0), topic('b', 0, ShadowTopicState.FAULTED)], fence: fencedStep })
        .failover
    ).toMatchObject({ ready: false, reason: expect.stringContaining('b has faulted') });
    expect(
      getFailoverReadiness({ topics: [topic('a', 0, ShadowTopicState.PAUSED)], fence: fencedStep }).failover.reason
    ).toContain('a is paused');
  });

  test('is done when every topic has failed over, leaving only moving clients', () => {
    const readiness = getFailoverReadiness({
      topics: [topic('a', 0, ShadowTopicState.FAILED_OVER), topic('b', 0, ShadowTopicState.PROMOTED)],
      fence: fencedStep,
    });
    expect(readiness.failover).toMatchObject({ done: true, ready: false });
    expect(getFailoverStepStates(readiness)).toEqual({
      settings: 'done',
      fence: 'done',
      fenced: 'done',
      lag: 'done',
      failover: 'done',
      clients: 'current',
    });
  });

  test('is done when the only topics left are faulted ones, which a failover leaves alone', () => {
    const readiness = getFailoverReadiness({
      topics: [topic('a', 0, ShadowTopicState.FAILED_OVER), topic('b', 0, ShadowTopicState.FAULTED)],
      fence: fencedStep,
    });
    expect(readiness.failover.done).toBe(true);
    expect(
      getFailoverReadiness({ topics: [topic('b', 0, ShadowTopicState.FAULTED)], fence: fencedStep }).failover.done
    ).toBe(false);
  });
});

describe('getLinkIdentity', () => {
  const linkWith = (clientOptions: unknown) => ({ configurations: { clientOptions } }) as UnifiedShadowLink;

  test('reads the user of a SCRAM or PLAIN link', () => {
    expect(
      getLinkIdentity(
        linkWith({
          authenticationConfiguration: {
            authentication: { case: 'scramConfiguration', value: { username: 'shadow-orders' } },
          },
        })
      )
    ).toEqual({ authentication: 'sasl', principal: 'shadow-orders' });
    expect(
      getLinkIdentity(
        linkWith({
          authenticationConfiguration: { authentication: { case: 'plainConfiguration', value: { username: 'plain' } } },
        })
      )
    ).toEqual({ authentication: 'sasl', principal: 'plain' });
  });

  test('a client certificate without SASL is mTLS; neither is no authentication', () => {
    expect(
      getLinkIdentity(
        linkWith({ tlsSettings: { enabled: true, tlsSettings: { case: 'tlsPemSettings', value: { cert: 'PEM' } } } })
      )
    ).toEqual({ authentication: 'mtls' });
    expect(getLinkIdentity(linkWith({ tlsSettings: { enabled: true } }))).toEqual({ authentication: 'none' });
    expect(getLinkIdentity(undefined)).toEqual({});
  });
});

describe('getFailoverStepStates', () => {
  test('the source’s three steps go in order: settings, Fence, then Fenced', () => {
    const states = (source: ShadowLinkSource) =>
      getFailoverStepStates(getFailoverReadiness({ topics: caughtUp, fence: step(source) }));

    expect(states(cloudSource('unfenced', []))).toMatchObject({
      settings: 'attention',
      fence: 'pending',
      fenced: 'pending',
    });
    expect(states(cloudSource('unfenced'))).toMatchObject({ settings: 'done', fence: 'current', fenced: 'pending' });
    expect(states(cloudSource('fencing'))).toMatchObject({
      settings: 'done',
      fence: 'done',
      fenced: 'current',
      lag: 'pending',
    });
    expect(states(cloudSource('fenced'))).toMatchObject({ fenced: 'done', lag: 'done', failover: 'current' });
  });
});
