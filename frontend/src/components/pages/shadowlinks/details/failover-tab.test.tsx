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

import { beforeEach, describe, expect, onTestFinished, rs, test } from '@rstest/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LinkIdentity } from 'components/shadow-box/shadow-box-model';
import type { ShadowLinkPeerBoxBroker, ShadowLinkPeerBoxState, ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { type FailoverReadiness, type FailoverTopic, getFailoverReadiness, getSourceBoxStep } from './failover-model';
import { FailoverTab } from './failover-tab';
import type { UnifiedShadowLink } from '../model';

const link = { name: 'orders-dr' } as UnifiedShadowLink;

const sasl: LinkIdentity = { authentication: 'sasl', principal: 'shadow-orders' };

const topics = (lags: number[]): FailoverTopic[] =>
  lags.map((lag, index) => ({
    topicName: index === 0 ? 'orders-events' : `orders-${index}`,
    state: ShadowTopicState.ACTIVE,
    totalLag: BigInt(lag),
  }));

/** orders-events, then orders-audit, each with no lag, in these states. */
const inStates = (...states: ShadowTopicState[]): FailoverTopic[] =>
  states.map((state, index) => ({ topicName: ['orders-events', 'orders-audit'][index] ?? '', state, totalLag: 0n }));

const NOW = Date.UTC(2026, 5, 1, 12);
const MINUTE = 60 * 1000;

const cloudSource = (
  state: ShadowLinkPeerBoxState,
  exemptPrincipals = ['shadow-orders'],
  brokers: ShadowLinkPeerBoxBroker[] = [],
  stateChangedAt?: string
): ShadowLinkSource => ({
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod-us-east-1',
  box: {
    status: 'known',
    state,
    revision: '18',
    stateChangedAt,
    exemptPrincipals,
    allowAllReads: false,
    brokers,
  },
});

const readinessFor = (
  source: ShadowLinkSource | undefined,
  failoverTopics: FailoverTopic[] | undefined,
  {
    identity = sasl,
    topicsFailed = false,
    resolving = false,
  }: { identity?: LinkIdentity; topicsFailed?: boolean; resolving?: boolean } = {}
): FailoverReadiness => {
  const box = getSourceBoxStep({ source, link: identity, resolving });
  if (!box) {
    throw new Error('No guided failover for this source');
  }
  return getFailoverReadiness({ topics: failoverTopics, topicsFailed, box });
};

const cloudReadiness = (state: ShadowLinkPeerBoxState, lags: number[], exemptPrincipals = ['shadow-orders']) =>
  readinessFor(cloudSource(state, exemptPrincipals), topics(lags));

const renderTab = (
  readiness: FailoverReadiness,
  { onRetryTopics = rs.fn(), identity = sasl }: { onRetryTopics?: () => void; identity?: LinkIdentity } = {}
) =>
  render(<FailoverTab linkIdentity={identity} onRetryTopics={onRetryTopics} readiness={readiness} shadowLink={link} />);

const expectLane = (testId: string, title: string, stepIds: string[]) => {
  const lane = screen.getByTestId(testId);
  expect(lane).toHaveTextContent(title);
  for (const stepId of stepIds) {
    expect(within(lane).getByTestId(stepId)).toBeVisible();
  }
};

describe('the FailoverTab', () => {
  const openCluster = rs.fn();

  beforeEach(() => {
    rs.clearAllMocks();
    useShadowBoxStore.setState({
      topology: { clusterName: 'dr-us-west-2', readers: [], sources: {}, resolving: false, readersIncomplete: false },
      openCluster,
    });
  });

  test('lays the six steps out in two lanes: three on the source, three here', () => {
    renderTab(cloudReadiness('unboxed', [0, 0]));

    expect(screen.getByText('Fail over from prod-us-east-1')).toBeVisible();
    expectLane('failover-lane-source', 'On prod-us-east-1', [
      'failover-step-settings',
      'failover-step-box',
      'failover-step-boxed',
    ]);
    expectLane('failover-lane-shadow', 'On dr-us-west-2', [
      'failover-step-lag',
      'failover-step-failover',
      'failover-step-clients',
    ]);
  });

  describe('on the source', () => {
    test('reports the source’s steps without acting on them, and opens the source’s fence once', async () => {
      const user = userEvent.setup();
      renderTab(cloudReadiness('unboxed', [0, 0]));

      const lane = screen.getByTestId('failover-lane-source');
      expect(within(lane).getAllByRole('button')).toHaveLength(1);
      expect(screen.getByTestId('failover-step-settings')).toHaveAttribute('data-state', 'done');
      expect(screen.getByTestId('failover-step-box')).toHaveAttribute('data-state', 'current');
      expect(screen.getByTestId('failover-status')).toHaveTextContent(
        'Not ready until the source cluster reports Fenced.'
      );

      await user.click(within(lane).getByRole('button', { name: 'Open prod-us-east-1' }));
      expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source');
    });

    test('without a host that can open another cluster, offers no button', () => {
      useShadowBoxStore.setState({ openCluster: null });
      renderTab(cloudReadiness('boxed', [0]));

      expect(screen.queryByTestId('failover-open-source')).not.toBeInTheDocument();
    });

    test('settings that would block this link say so once, in step 1', () => {
      renderTab(cloudReadiness('unboxed', [5], []));

      expect(screen.getByTestId('failover-step-settings')).toHaveAttribute('data-state', 'attention');
      expect(screen.getByTestId('failover-step-settings')).toHaveTextContent('Not exempt');
      expect(screen.getByTestId('failover-link-not-exempt')).toHaveTextContent('Once prod-us-east-1 is fenced');
      expect(screen.getByTestId('failover-step-lag')).not.toHaveTextContent('exempt');
    });

    test('once fenced with the link blocked, says its fetches are rejected and lag can’t drain', () => {
      renderTab(cloudReadiness('boxed', [0], []));

      expect(screen.getByTestId('failover-link-not-exempt')).toHaveTextContent('fence rejects this link’s fetches');
      expect(screen.getByTestId('failover-step-lag')).toHaveTextContent('Link can’t read');
      expect(screen.getByTestId('failover-status')).toHaveTextContent('lets this link read');
    });

    test('while fencing, waits for Fenced and names a broker that holds it', () => {
      const brokers: ShadowLinkPeerBoxBroker[] = [
        { nodeId: 1, status: 'confirmed' },
        { nodeId: 2, status: 'not-answering' },
      ];
      renderTab(readinessFor(cloudSource('boxing', ['shadow-orders'], brokers), topics([3])));

      expect(screen.getByTestId('failover-step-box')).toHaveAttribute('data-state', 'done');
      expect(screen.getByTestId('failover-step-boxed')).toHaveAttribute('data-state', 'current');
      expect(screen.getByTestId('failover-boxing-progress')).toHaveTextContent('1 of 2 brokers have confirmed.');
      expect(screen.getByTestId('failover-boxing-progress')).toHaveTextContent('Broker 2 isn’t answering');
      expect(screen.getByTestId('failover-step-lag')).toHaveTextContent('Waiting');
    });

    test('shows how long the source has been fencing once, in step 3', () => {
      rs.setSystemTime(NOW);
      onTestFinished(() => {
        rs.useRealTimers();
      });
      const changedAt = new Date(NOW - 5 * MINUTE).toISOString();
      renderTab(readinessFor(cloudSource('boxing', ['shadow-orders'], [], changedAt), topics([3])));

      expect(screen.getByTestId('failover-step-box')).not.toHaveTextContent('5 min');
      expect(screen.getByTestId('failover-step-boxed')).toHaveTextContent('for 5 min');
    });

    test('for an mTLS link, says Console can’t check the exempt list', () => {
      const identity: LinkIdentity = { authentication: 'mtls' };
      renderTab(readinessFor(cloudSource('boxed', ['shadow-orders']), topics([0]), { identity }), { identity });

      expect(screen.getByTestId('failover-link-principal-unknown')).toHaveTextContent('mapping rules');
    });

    test('when a fence read earlier can’t be read now, says so in place of the steps, and still opens the source', async () => {
      const user = userEvent.setup();
      renderTab(
        getFailoverReadiness({
          topics: topics([0]),
          box: {
            kind: 'unreadable',
            source: cloudSource('boxed') as Extract<ShadowLinkSource, { kind: 'cloud' }>,
            reason: 'no-leader',
          },
        })
      );

      expect(screen.getByTestId('failover-box-unreadable')).toHaveTextContent('It has no controller leader.');
      expect(screen.queryByTestId('failover-step-settings')).not.toBeInTheDocument();
      expect(screen.getByTestId('failover-status')).toHaveTextContent('can read the source’s fence again');
      await user.click(screen.getByTestId('failover-open-source'));
      expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source');
    });

    test('while the host is still resolving links, waits for the source', () => {
      renderTab(readinessFor(undefined, topics([0]), { resolving: true }));

      expect(screen.getByTestId('failover-box-loading')).toHaveTextContent('Finding the cluster this link reads from');
      expect(screen.queryByTestId('failover-step-settings')).not.toBeInTheDocument();
    });
  });

  describe('on this cluster', () => {
    test('while lag drains, names the topic furthest behind', () => {
      renderTab(cloudReadiness('boxed', [1204, 0, 0]));

      expect(screen.getByTestId('failover-step-boxed')).toHaveAttribute('data-state', 'done');
      expect(screen.getByTestId('failover-step-lag')).toHaveAttribute('data-state', 'current');
      expect(screen.getByTestId('failover-lag-summary')).toHaveTextContent(
        '2 of 3 topics caught up. orders-events is 1,204 messages behind.'
      );
      expect(screen.getByTestId('failover-status')).toHaveTextContent('Not ready until every topic has zero lag.');
    });

    test('once the source is fenced and every topic has caught up, points to the one Fail over button', () => {
      renderTab(cloudReadiness('boxed', [0, 0]));

      expect(screen.getByTestId('failover-step-failover')).toHaveAttribute('data-state', 'current');
      expect(screen.getByTestId('failover-status')).toHaveTextContent('Fail over with Fail over all topics above.');
      expect(within(screen.getByTestId('failover-lane-shadow')).queryByRole('button')).not.toBeInTheDocument();
    });

    test('when a refresh fails, keeps the last lag on screen but marks it out of date', async () => {
      const user = userEvent.setup();
      const onRetryTopics = rs.fn();
      renderTab(readinessFor(cloudSource('boxed'), topics([0, 0]), { topicsFailed: true }), { onRetryTopics });

      expect(screen.getByTestId('failover-lag-stale')).toBeVisible();
      expect(screen.getByTestId('failover-lag-summary')).toHaveTextContent('2 of 2 topics caught up.');
      expect(screen.getByTestId('failover-step-lag')).toHaveTextContent('Out of date');
      expect(screen.getByTestId('failover-status')).toHaveTextContent('Couldn’t refresh');
      await user.click(screen.getByTestId('failover-lag-retry'));
      expect(onRetryTopics).toHaveBeenCalledTimes(1);
    });

    test('while the topics load, claims nothing about lag', () => {
      renderTab(readinessFor(cloudSource('boxed'), undefined));

      expect(screen.getByTestId('failover-lag-loading')).toBeVisible();
      expect(screen.queryByTestId('failover-lag-progress')).not.toBeInTheDocument();
      expect(screen.getByTestId('failover-step-lag')).not.toHaveAttribute('data-state', 'done');
    });

    test('when the topics can’t load, says so and offers a retry', async () => {
      const user = userEvent.setup();
      const onRetryTopics = rs.fn();
      renderTab(readinessFor(cloudSource('boxed'), undefined, { topicsFailed: true }), { onRetryTopics });

      expect(screen.getByTestId('failover-lag-error')).toHaveTextContent('Couldn’t load the link’s topics');
      expect(screen.getByTestId('failover-status')).toHaveTextContent('Couldn’t load the link’s topics');
      await user.click(screen.getByTestId('failover-lag-retry'));
      expect(onRetryTopics).toHaveBeenCalledTimes(1);
    });

    test('a faulted topic keeps failover not ready and names the topic', () => {
      renderTab(readinessFor(cloudSource('boxed'), inStates(ShadowTopicState.ACTIVE, ShadowTopicState.FAULTED)));

      expect(screen.getByTestId('failover-faulted-topics')).toHaveTextContent('orders-audit has faulted');
      expect(screen.getByTestId('failover-step-lag')).toHaveTextContent('Topics faulted');
      expect(screen.getByTestId('failover-status')).toHaveTextContent('orders-audit has faulted');
    });
  });

  describe('once failover starts', () => {
    test('while topics are still failing over, says so and keeps moving clients for later', () => {
      renderTab(
        readinessFor(cloudSource('boxed'), inStates(ShadowTopicState.FAILED_OVER, ShadowTopicState.FAILING_OVER))
      );

      expect(screen.queryByTestId('failover-done')).not.toBeInTheDocument();
      expect(screen.getByTestId('failover-step-failover')).toHaveTextContent('Failing over');
      expect(screen.getByTestId('failover-status')).toHaveTextContent('Failing over 1 topic…');
      expect(screen.getByTestId('failover-step-clients')).toHaveAttribute('data-state', 'pending');
    });

    test('after failover, moving clients is the last step: repoint them and leave the source fenced', () => {
      renderTab(readinessFor(cloudSource('boxed'), inStates(ShadowTopicState.FAILED_OVER)));

      expect(screen.getByTestId('failover-done')).toHaveTextContent('Every topic of orders-dr has failed over');
      expect(screen.getByTestId('failover-step-clients')).toHaveAttribute('data-state', 'current');
      expect(screen.getByTestId('failover-move-clients')).toHaveTextContent(
        'Repoint producers and consumers to dr-us-west-2'
      );
      expect(screen.getByTestId('failover-move-clients')).toHaveTextContent('Leave prod-us-east-1 fenced');
      expect(screen.queryByTestId('failover-status')).not.toBeInTheDocument();
    });

    test('a failover that left a faulted topic behind still finishes', () => {
      renderTab(readinessFor(cloudSource('boxed'), inStates(ShadowTopicState.FAILED_OVER, ShadowTopicState.FAULTED)));

      expect(screen.getByTestId('failover-done')).toHaveTextContent('apart from orders-audit, which has faulted');
    });
  });
});
