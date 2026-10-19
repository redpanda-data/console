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

import { describe, expect, test } from '@rstest/core';
import type { ShadowLinkPeerBoxState, ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import {
  type CutoverTopic,
  getCutoverReadiness,
  getCutoverStepStates,
  getLagStep,
  getLinkPrincipal,
  getSourceBoxStep,
} from './cutover-model';
import type { UnifiedShadowLink } from '../model';

const cloudSource = (state: ShadowLinkPeerBoxState, exemptPrincipals = ['shadow-orders']): ShadowLinkSource => ({
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod-us-east-1',
  box: { status: 'known', state, revision: 3, exemptPrincipals, allowAllReads: false },
});

const topic = (topicName: string, totalLag: number, state = ShadowTopicState.ACTIVE): CutoverTopic => ({
  topicName,
  state,
  totalLag: BigInt(totalLag),
});

const caughtUp = [topic('orders-events', 0), topic('orders-audit', 0)];

describe('getSourceBoxStep', () => {
  test('reads a Cloud source’s box and whether this link can still fetch from it', () => {
    expect(
      getSourceBoxStep({
        source: cloudSource('boxed'),
        linkPrincipal: 'shadow-orders',
        topology: 'resolved',
        manuallyConfirmed: false,
      })
    ).toMatchObject({ kind: 'cloud', boxed: true, linkExempt: true });
    expect(
      getSourceBoxStep({
        source: cloudSource('boxed', []),
        linkPrincipal: 'shadow-orders',
        topology: 'resolved',
        manuallyConfirmed: false,
      })
    ).toMatchObject({ linkExempt: false });
    expect(
      getSourceBoxStep({
        source: cloudSource('boxed'),
        linkPrincipal: undefined,
        topology: 'resolved',
        manuallyConfirmed: false,
      })
    ).toMatchObject({ linkExempt: undefined });
  });

  test('falls back to a manual confirmation when Console can’t read the source’s box', () => {
    expect(
      getSourceBoxStep({ source: undefined, linkPrincipal: undefined, topology: 'none', manuallyConfirmed: true })
    ).toMatchObject({ kind: 'manual', reason: 'standalone', confirmed: true });
    expect(
      getSourceBoxStep({
        source: { kind: 'external', bootstrapServers: ['kafka:9092'] },
        linkPrincipal: undefined,
        topology: 'resolved',
        manuallyConfirmed: false,
      })
    ).toMatchObject({ kind: 'manual', reason: 'external' });
    expect(
      getSourceBoxStep({
        source: { kind: 'cloud', clusterId: 'prod', clusterName: 'prod', box: { status: 'unavailable' } },
        linkPrincipal: undefined,
        topology: 'resolved',
        manuallyConfirmed: false,
      })
    ).toMatchObject({ kind: 'manual', reason: 'unavailable' });
  });

  test('waits while the host resolves links, and says when it couldn’t resolve this one', () => {
    expect(
      getSourceBoxStep({ source: undefined, linkPrincipal: undefined, topology: 'resolving', manuallyConfirmed: false })
    ).toEqual({ kind: 'loading', source: undefined });
    expect(
      getSourceBoxStep({ source: undefined, linkPrincipal: undefined, topology: 'resolved', manuallyConfirmed: false })
    ).toMatchObject({ kind: 'manual', reason: 'unresolved' });
  });
});

describe('getLagStep', () => {
  test('lag only counts as drained once the source is boxed', () => {
    expect(getLagStep(caughtUp, 'ready').status).toBe('caught-up');
    expect(getLagStep(caughtUp, 'waiting').status).toBe('waiting-for-box');
  });

  test('lists the topics still behind, worst first', () => {
    const lag = getLagStep([topic('a', 3), topic('b', 1204), topic('c', 0)], 'ready');
    expect(lag).toMatchObject({ status: 'draining', syncing: 3, caughtUp: 1 });
    expect(lag.behind.map((entry) => entry.topicName)).toEqual(['b', 'a']);
  });

  test('reports paused and faulted topics', () => {
    const lag = getLagStep([topic('a', 0, ShadowTopicState.PAUSED), topic('b', 0, ShadowTopicState.FAULTED)], 'ready');
    expect(lag.paused).toEqual(['a']);
    expect(lag.faulted).toEqual(['b']);
  });

  test('a faulted topic means the link hasn’t caught up', () => {
    expect(getLagStep([topic('a', 0), topic('b', 0, ShadowTopicState.FAULTED)], 'ready').status).toBe('faulted');
  });

  test('says nothing about lag until the topics load', () => {
    expect(getLagStep(undefined, 'ready')).toMatchObject({ status: 'loading', behind: [] });
    expect(getLagStep(undefined, 'ready', true).status).toBe('unavailable');
  });
});

describe('getCutoverReadiness', () => {
  const boxedStep = getSourceBoxStep({
    source: cloudSource('boxed'),
    linkPrincipal: 'shadow-orders',
    topology: 'resolved',
    manuallyConfirmed: false,
  });

  test('unlocks failover once the source is boxed and lag is zero', () => {
    expect(getCutoverReadiness({ topics: caughtUp, box: boxedStep }).failover).toEqual({
      done: false,
      inProgress: 0,
      enabled: true,
      reason: undefined,
    });
  });

  test('a box that blocks this link’s reads isn’t ready, because the link can’t finish syncing', () => {
    const blocking = getSourceBoxStep({
      source: cloudSource('boxed', ['someone-else']),
      linkPrincipal: 'shadow-orders',
      topology: 'resolved',
      manuallyConfirmed: false,
    });
    const readiness = getCutoverReadiness({ topics: caughtUp, box: blocking });

    expect(readiness.lag.status).toBe('blocked');
    expect(readiness.failover).toMatchObject({
      enabled: false,
      reason: expect.stringContaining('lets this link read'),
    });
    expect(getCutoverStepStates(readiness)).toMatchObject({ box: 'current', failover: 'pending' });
  });

  test('a failed refresh keeps the last lag but won’t call it caught up', () => {
    const readiness = getCutoverReadiness({ topics: caughtUp, topicsFailed: true, box: boxedStep });

    expect(readiness.lag).toMatchObject({ status: 'caught-up', stale: true, caughtUp: 2 });
    expect(readiness.failover).toMatchObject({ enabled: false, reason: expect.stringContaining('Couldn’t refresh') });
    expect(getCutoverStepStates(readiness)).toMatchObject({ lag: 'current', failover: 'pending' });
  });

  test('isn’t done while topics are still failing over', () => {
    const readiness = getCutoverReadiness({
      topics: [topic('a', 0, ShadowTopicState.FAILED_OVER), topic('b', 0, ShadowTopicState.FAILING_OVER)],
      box: boxedStep,
    });

    expect(readiness.failover).toEqual({
      done: false,
      inProgress: 1,
      enabled: false,
      reason: 'Failing over 1 topic…',
    });
  });

  test('keeps failover locked, with a reason, until then', () => {
    const unboxed = getSourceBoxStep({
      source: cloudSource('unboxed'),
      linkPrincipal: 'shadow-orders',
      topology: 'resolved',
      manuallyConfirmed: false,
    });
    expect(getCutoverReadiness({ topics: caughtUp, box: unboxed }).failover.reason).toBe(
      'Available once the source cluster reports Boxed.'
    );
    expect(getCutoverReadiness({ topics: [topic('a', 5)], box: boxedStep }).failover.reason).toBe(
      'Available when every topic has zero lag.'
    );
    expect(getCutoverReadiness({ topics: undefined, box: boxedStep }).failover.reason).toBe(
      'Loading the link’s topics.'
    );
    expect(getCutoverReadiness({ topics: undefined, topicsFailed: true, box: boxedStep }).failover.reason).toBe(
      'Couldn’t load the link’s topics, so Console can’t check their lag.'
    );
    expect(
      getCutoverReadiness({ topics: [topic('a', 0), topic('b', 0, ShadowTopicState.FAULTED)], box: boxedStep }).failover
    ).toMatchObject({ enabled: false, reason: expect.stringContaining('b has faulted') });
    expect(
      getCutoverReadiness({ topics: [topic('a', 0, ShadowTopicState.PAUSED)], box: boxedStep }).failover.reason
    ).toContain('a is paused');
  });

  test('is done when every topic has failed over', () => {
    const readiness = getCutoverReadiness({
      topics: [topic('a', 0, ShadowTopicState.FAILED_OVER), topic('b', 0, ShadowTopicState.PROMOTED)],
      box: boxedStep,
    });
    expect(readiness.failover).toMatchObject({ done: true, enabled: false });
    expect(getCutoverStepStates(readiness)).toEqual({ box: 'done', lag: 'done', failover: 'done' });
  });

  test('is done when the only topics left are faulted ones, which a failover leaves alone', () => {
    const readiness = getCutoverReadiness({
      topics: [topic('a', 0, ShadowTopicState.FAILED_OVER), topic('b', 0, ShadowTopicState.FAULTED)],
      box: boxedStep,
    });
    expect(readiness.failover.done).toBe(true);
    expect(
      getCutoverReadiness({ topics: [topic('b', 0, ShadowTopicState.FAULTED)], box: boxedStep }).failover.done
    ).toBe(false);
  });
});

describe('getLinkPrincipal', () => {
  const linkWith = (authentication: unknown) =>
    ({ configurations: { clientOptions: { authenticationConfiguration: { authentication } } } }) as UnifiedShadowLink;

  test('reads the user of a SCRAM or PLAIN link', () => {
    expect(getLinkPrincipal(linkWith({ case: 'scramConfiguration', value: { username: 'shadow-orders' } }))).toBe(
      'shadow-orders'
    );
    expect(getLinkPrincipal(linkWith({ case: 'plainConfiguration', value: { username: 'shadow-plain' } }))).toBe(
      'shadow-plain'
    );
    expect(getLinkPrincipal(linkWith(undefined))).toBeUndefined();
  });
});

describe('getCutoverStepStates', () => {
  test('each step unlocks when the one before it is done', () => {
    const box = getSourceBoxStep({
      source: undefined,
      linkPrincipal: undefined,
      topology: 'none',
      manuallyConfirmed: false,
    });
    expect(getCutoverStepStates(getCutoverReadiness({ topics: caughtUp, box }))).toEqual({
      box: 'current',
      lag: 'pending',
      failover: 'pending',
    });

    const confirmed = { ...box, confirmed: true } as typeof box;
    expect(getCutoverStepStates(getCutoverReadiness({ topics: [topic('a', 9)], box: confirmed }))).toEqual({
      box: 'done',
      lag: 'current',
      failover: 'pending',
    });
    expect(getCutoverStepStates(getCutoverReadiness({ topics: caughtUp, box: confirmed }))).toEqual({
      box: 'done',
      lag: 'done',
      failover: 'current',
    });
  });
});
