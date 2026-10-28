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

import type { LinkIdentity } from 'components/shadow-box/shadow-box-model';
import type { ShadowLinkPeerBoxState, ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

import {
  type CutoverTopic,
  getCutoverReadiness,
  getCutoverStepStates,
  getLagStep,
  getLinkIdentity,
  getSourceBoxStep,
} from './cutover-model';
import { describe, expect, test } from 'bun:test';
import type { UnifiedShadowLink } from '../model';

const cloudSource = (state: ShadowLinkPeerBoxState, exemptPrincipals = ['shadow-orders']): ShadowLinkSource => ({
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod-us-east-1',
  box: {
    status: 'known',
    state,
    revision: '18',
    exemptPrincipals,
    allowAllReads: false,
    skipTransactionExpiration: false,
    brokers: [],
  },
});

const sasl: LinkIdentity = { authentication: 'sasl', principal: 'shadow-orders' };

const step = (source: ShadowLinkSource | undefined, link: LinkIdentity = sasl, manuallyConfirmed = false) =>
  getSourceBoxStep({ source, link, topology: source ? 'resolved' : 'none', manuallyConfirmed });

const topic = (topicName: string, totalLag: number, state = ShadowTopicState.ACTIVE): CutoverTopic => ({
  topicName,
  state,
  totalLag: BigInt(totalLag),
});

const caughtUp = [topic('orders-events', 0), topic('orders-audit', 0)];

describe('getSourceBoxStep', () => {
  test('reads a Cloud source’s box and whether its saved settings let this link fetch, in any phase', () => {
    expect(step(cloudSource('boxed'))).toMatchObject({ kind: 'cloud', boxed: true, linkExempt: true });
    expect(step(cloudSource('unboxed', []))).toMatchObject({ boxed: false, linkExempt: false });
    expect(step(cloudSource('boxed', ['User:shadow-orders']))).toMatchObject({ linkExempt: false });
  });

  test('a link without SASL or mTLS needs the empty name; an mTLS link can’t be checked', () => {
    expect(step(cloudSource('boxed', ['']), { authentication: 'none' })).toMatchObject({ linkExempt: true });
    expect(step(cloudSource('boxed'), { authentication: 'none' })).toMatchObject({ linkExempt: false });
    expect(step(cloudSource('boxed'), { authentication: 'mtls' })).toMatchObject({ linkExempt: undefined });
  });

  test('falls back to a manual confirmation when Console can’t read the source’s box', () => {
    expect(step(undefined, sasl, true)).toMatchObject({ kind: 'manual', reason: 'standalone', confirmed: true });
    expect(step({ kind: 'external', bootstrapServers: ['kafka:9092'] })).toMatchObject({
      kind: 'manual',
      reason: 'external',
    });
    expect(
      step({
        kind: 'cloud',
        clusterId: 'prod',
        clusterName: 'prod',
        box: { status: 'unavailable', reason: 'forbidden' },
      })
    ).toMatchObject({ kind: 'manual', reason: 'unavailable' });
  });

  test('waits while the host resolves links, and says when it couldn’t resolve this one', () => {
    expect(
      getSourceBoxStep({ source: undefined, link: sasl, topology: 'resolving', manuallyConfirmed: false })
    ).toEqual({ kind: 'loading', source: undefined });
    expect(
      getSourceBoxStep({ source: undefined, link: sasl, topology: 'resolved', manuallyConfirmed: false })
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
  const boxedStep = step(cloudSource('boxed'));

  test('unlocks failover once the source is boxed and lag is zero', () => {
    expect(getCutoverReadiness({ topics: caughtUp, box: boxedStep }).failover).toEqual({
      done: false,
      inProgress: 0,
      enabled: true,
      reason: undefined,
    });
  });

  test('a box that blocks this link’s reads isn’t ready, because the link can’t finish copying', () => {
    const readiness = getCutoverReadiness({ topics: caughtUp, box: step(cloudSource('boxed', ['someone-else'])) });

    expect(readiness.lag.status).toBe('blocked');
    expect(readiness.failover).toMatchObject({
      enabled: false,
      reason: expect.stringContaining('lets this link read'),
    });
    expect(getCutoverStepStates(readiness)).toMatchObject({
      settings: 'attention',
      box: 'done',
      boxed: 'done',
      failover: 'pending',
    });
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
    expect(getCutoverReadiness({ topics: caughtUp, box: step(cloudSource('unboxed')) }).failover.reason).toBe(
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

  test('is done when every topic has failed over, leaving only moving clients', () => {
    const readiness = getCutoverReadiness({
      topics: [topic('a', 0, ShadowTopicState.FAILED_OVER), topic('b', 0, ShadowTopicState.PROMOTED)],
      box: boxedStep,
    });
    expect(readiness.failover).toMatchObject({ done: true, enabled: false });
    expect(getCutoverStepStates(readiness)).toEqual({
      settings: 'done',
      box: 'done',
      boxed: 'done',
      lag: 'done',
      failover: 'done',
      clients: 'current',
    });
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

describe('getCutoverStepStates', () => {
  test('the source’s three steps go in order: settings, Box, then Boxed', () => {
    const states = (source: ShadowLinkSource) =>
      getCutoverStepStates(getCutoverReadiness({ topics: caughtUp, box: step(source) }));

    expect(states(cloudSource('unboxed', []))).toMatchObject({
      settings: 'attention',
      box: 'pending',
      boxed: 'pending',
    });
    expect(states(cloudSource('unboxed'))).toMatchObject({ settings: 'done', box: 'current', boxed: 'pending' });
    expect(states(cloudSource('boxing'))).toMatchObject({
      settings: 'done',
      box: 'done',
      boxed: 'current',
      lag: 'pending',
    });
    expect(states(cloudSource('boxed'))).toMatchObject({ boxed: 'done', lag: 'done', failover: 'current' });
  });

  test('a manual confirmation covers the source’s three steps', () => {
    const manual = step(undefined);
    expect(getCutoverStepStates(getCutoverReadiness({ topics: caughtUp, box: manual }))).toMatchObject({
      settings: 'current',
      box: 'pending',
      boxed: 'pending',
      lag: 'pending',
    });

    const confirmed = step(undefined, sasl, true);
    expect(getCutoverStepStates(getCutoverReadiness({ topics: [topic('a', 9)], box: confirmed }))).toMatchObject({
      settings: 'done',
      box: 'done',
      boxed: 'done',
      lag: 'current',
      failover: 'pending',
    });
    expect(getCutoverStepStates(getCutoverReadiness({ topics: caughtUp, box: confirmed }))).toMatchObject({
      lag: 'done',
      failover: 'current',
      clients: 'pending',
    });
  });
});
