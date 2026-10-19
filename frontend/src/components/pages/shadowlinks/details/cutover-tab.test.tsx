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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShadowLinkPeerBoxState } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { type CutoverTopic, getCutoverReadiness, getSourceBoxStep } from './cutover-model';
import { CutoverTab } from './cutover-tab';
import type { UnifiedShadowLink } from '../model';

const link = { name: 'orders-dr' } as UnifiedShadowLink;

const topics = (lags: number[]): CutoverTopic[] =>
  lags.map((lag, index) => ({
    topicName: index === 0 ? 'orders-events' : `orders-${index}`,
    state: ShadowTopicState.ACTIVE,
    totalLag: BigInt(lag),
  }));

const cloudReadiness = (state: ShadowLinkPeerBoxState, lags: number[], exemptPrincipals = ['shadow-orders']) =>
  getCutoverReadiness({
    topics: topics(lags),
    box: getSourceBoxStep({
      source: {
        kind: 'cloud',
        clusterId: 'prod',
        clusterName: 'prod-us-east-1',
        box: { status: 'known', state, revision: 3, exemptPrincipals, allowAllReads: false },
      },
      linkPrincipal: 'shadow-orders',
      topology: 'resolved',
      manuallyConfirmed: false,
    }),
  });

const renderTab = (readiness: ReturnType<typeof getCutoverReadiness>, onFailoverAll = rs.fn()) =>
  render(
    <CutoverTab
      isFailingOver={false}
      linkPrincipal="shadow-orders"
      onFailoverAll={onFailoverAll}
      onManualConfirmChange={rs.fn()}
      onRetryTopics={rs.fn()}
      readiness={readiness}
      shadowLink={link}
    />
  );

describe('CutoverTab', () => {
  const openCluster = rs.fn();

  beforeEach(() => {
    rs.clearAllMocks();
    useShadowBoxStore.setState({
      topology: { clusterName: 'dr-us-west-2', readers: [], sources: {}, resolving: false, readersIncomplete: false },
      openCluster,
    });
  });

  test('before boxing, offers to box the source and keeps failover locked', async () => {
    const user = userEvent.setup();
    renderTab(cloudReadiness('unboxed', [0, 0]));

    expect(screen.getByText('Cut over from prod-us-east-1')).toBeVisible();
    expect(screen.getByTestId('cutover-step-box')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
    expect(screen.getByTestId('cutover-failover-reason')).toHaveTextContent(
      'Available once the source cluster reports Boxed.'
    );

    await user.click(screen.getByTestId('cutover-open-source'));
    expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source&action=box');
  });

  test('once the source is boxed, offers to open it or unbox it, with that dialog open on arrival', async () => {
    const user = userEvent.setup();
    renderTab(cloudReadiness('boxed', [5]));

    await user.click(screen.getByTestId('cutover-unbox-source'));
    expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source&action=unbox');
    await user.click(screen.getByTestId('cutover-open-source'));
    expect(openCluster).toHaveBeenLastCalledWith('prod', '/shadowlinks?tab=source');
  });

  test('while lag drains, names the topic furthest behind', () => {
    renderTab(cloudReadiness('boxed', [1204, 0, 0]));

    expect(screen.getByTestId('cutover-step-box')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('cutover-step-lag')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('cutover-lag-summary')).toHaveTextContent(
      '2 of 3 topics caught up. orders-events is 1,204 messages behind.'
    );
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('unlocks failover once the source is boxed and every topic has caught up', async () => {
    const user = userEvent.setup();
    const onFailoverAll = rs.fn();
    renderTab(cloudReadiness('boxed', [0, 0]), onFailoverAll);

    expect(screen.getByTestId('cutover-step-failover')).toHaveAttribute('data-state', 'current');
    await user.click(screen.getByTestId('cutover-failover-all'));
    expect(onFailoverAll).toHaveBeenCalledTimes(1);
  });

  test('warns when the source’s box fences this link out, and doesn’t count the box as done', () => {
    renderTab(cloudReadiness('boxed', [0], []));

    expect(screen.getByTestId('cutover-link-not-exempt')).toHaveTextContent('This link can’t finish syncing');
    expect(screen.getByTestId('cutover-step-box')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('cutover-step-lag')).toHaveTextContent('Link can’t read');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('when the box fences this link out, offers to exempt its user on the source in one step', async () => {
    const user = userEvent.setup();
    renderTab(cloudReadiness('boxed', [5], []));

    await user.click(screen.getByTestId('cutover-exempt-link'));
    expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source&action=exempt&principal=shadow-orders');
    expect(screen.queryByTestId('cutover-open-source')).not.toBeInTheDocument();
    expect(screen.getByTestId('cutover-unbox-source')).toBeVisible();
  });

  test('when Console can’t tell which user the link reads as, says to check it’s exempt', () => {
    render(
      <CutoverTab
        isFailingOver={false}
        linkPrincipal={undefined}
        onFailoverAll={rs.fn()}
        onManualConfirmChange={rs.fn()}
        onRetryTopics={rs.fn()}
        readiness={getCutoverReadiness({
          topics: topics([0]),
          box: getSourceBoxStep({
            source: {
              kind: 'cloud',
              clusterId: 'prod',
              clusterName: 'prod-us-east-1',
              box: { status: 'known', state: 'boxed', revision: 3, exemptPrincipals: [], allowAllReads: false },
            },
            linkPrincipal: undefined,
            topology: 'resolved',
            manuallyConfirmed: false,
          }),
        })}
        shadowLink={link}
      />
    );

    expect(screen.getByTestId('cutover-link-principal-unknown')).toBeVisible();
  });

  test('when a refresh fails, keeps the last lag on screen but marks it out of date and locks failover', async () => {
    const user = userEvent.setup();
    const onRetryTopics = rs.fn();
    render(
      <CutoverTab
        isFailingOver={false}
        linkPrincipal="shadow-orders"
        onFailoverAll={rs.fn()}
        onManualConfirmChange={rs.fn()}
        onRetryTopics={onRetryTopics}
        readiness={getCutoverReadiness({
          topics: topics([0, 0]),
          topicsFailed: true,
          box: cloudReadiness('boxed', [0]).box,
        })}
        shadowLink={link}
      />
    );

    expect(screen.getByTestId('cutover-lag-stale')).toBeVisible();
    expect(screen.getByTestId('cutover-lag-summary')).toHaveTextContent('2 of 2 topics caught up.');
    expect(screen.getByTestId('cutover-step-lag')).toHaveTextContent('Out of date');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
    await user.click(screen.getByTestId('cutover-lag-retry'));
    expect(onRetryTopics).toHaveBeenCalledTimes(1);
  });

  test('while topics are still failing over, says so instead of telling the user to repoint clients', () => {
    renderTab(
      getCutoverReadiness({
        topics: [
          { topicName: 'orders-events', state: ShadowTopicState.FAILED_OVER, totalLag: BigInt(0) },
          { topicName: 'orders-audit', state: ShadowTopicState.FAILING_OVER, totalLag: BigInt(0) },
        ],
        box: cloudReadiness('boxed', [0]).box,
      })
    );

    expect(screen.queryByTestId('cutover-done')).not.toBeInTheDocument();
    expect(screen.getByTestId('cutover-step-failover')).toHaveTextContent('Failing over');
    expect(screen.getByTestId('cutover-failover-reason')).toHaveTextContent('Failing over 1 topic…');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('before boxing, says to exempt the link rather than that the box already blocks it', () => {
    renderTab(cloudReadiness('unboxed', [5], []));

    expect(screen.getByTestId('cutover-link-not-exempt')).toHaveTextContent('Exempt this link when you box');
    expect(screen.getByTestId('cutover-link-not-exempt')).not.toHaveTextContent('blocks reads');
  });

  test('without a readable source box, asks for a manual confirmation and shows the Admin API calls', async () => {
    const user = userEvent.setup();
    const onManualConfirmChange = rs.fn();
    render(
      <CutoverTab
        isFailingOver={false}
        linkPrincipal="shadow-orders"
        onFailoverAll={rs.fn()}
        onManualConfirmChange={onManualConfirmChange}
        onRetryTopics={rs.fn()}
        readiness={getCutoverReadiness({
          topics: topics([0]),
          box: getSourceBoxStep({
            source: { kind: 'external', bootstrapServers: ['kafka-01.corp.example:9092'] },
            linkPrincipal: 'shadow-orders',
            topology: 'resolved',
            manuallyConfirmed: false,
          }),
        })}
        shadowLink={link}
      />
    );

    const step = screen.getByTestId('cutover-step-box');
    expect(within(step).getByText('kafka-01.corp.example:9092')).toBeVisible();
    expect(screen.getByTestId('cutover-admin-api-commands')).toHaveTextContent('"exemptPrincipals":["shadow-orders"]');
    expect(screen.getByTestId('cutover-admin-api-commands')).toHaveTextContent(
      '"updateMask":"readPolicy.exemptPrincipals"'
    );
    await user.click(screen.getByTestId('cutover-source-boxed-confirmation'));
    expect(onManualConfirmChange).toHaveBeenCalledWith(true);
  });

  test('after failover, tells the user to repoint clients and leave the source boxed', () => {
    renderTab(
      getCutoverReadiness({
        topics: [{ topicName: 'orders-events', state: ShadowTopicState.FAILED_OVER, totalLag: BigInt(0) }],
        box: cloudReadiness('boxed', [0]).box,
      })
    );

    expect(screen.getByTestId('cutover-done')).toHaveTextContent('Repoint producers and consumers to dr-us-west-2.');
    expect(screen.queryByTestId('cutover-failover-all')).not.toBeInTheDocument();
  });

  test('while the topics load, claims nothing about lag', () => {
    renderTab(getCutoverReadiness({ topics: undefined, box: cloudReadiness('boxed', [0]).box }));

    expect(screen.getByTestId('cutover-lag-loading')).toBeVisible();
    expect(screen.queryByTestId('cutover-lag-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('cutover-step-lag')).not.toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('when the topics can’t load, says so and offers a retry', async () => {
    const user = userEvent.setup();
    const onRetryTopics = rs.fn();
    render(
      <CutoverTab
        isFailingOver={false}
        linkPrincipal="shadow-orders"
        onFailoverAll={rs.fn()}
        onManualConfirmChange={rs.fn()}
        onRetryTopics={onRetryTopics}
        readiness={getCutoverReadiness({
          topics: undefined,
          topicsFailed: true,
          box: cloudReadiness('boxed', [0]).box,
        })}
        shadowLink={link}
      />
    );

    expect(screen.getByTestId('cutover-lag-error')).toHaveTextContent('Couldn’t load the link’s topics');
    expect(screen.getByTestId('cutover-failover-reason')).toHaveTextContent('Couldn’t load the link’s topics');
    await user.click(screen.getByTestId('cutover-lag-retry'));
    expect(onRetryTopics).toHaveBeenCalledTimes(1);
  });

  test('a faulted topic keeps failover locked and names the topic', () => {
    renderTab(
      getCutoverReadiness({
        topics: [
          { topicName: 'orders-events', state: ShadowTopicState.ACTIVE, totalLag: BigInt(0) },
          { topicName: 'orders-audit', state: ShadowTopicState.FAULTED, totalLag: BigInt(0) },
        ],
        box: cloudReadiness('boxed', [0]).box,
      })
    );

    expect(screen.getByTestId('cutover-faulted-topics')).toHaveTextContent('orders-audit has faulted');
    expect(screen.getByTestId('cutover-step-lag')).toHaveTextContent('Topics faulted');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('a failover that left a faulted topic behind still finishes', () => {
    renderTab(
      getCutoverReadiness({
        topics: [
          { topicName: 'orders-events', state: ShadowTopicState.FAILED_OVER, totalLag: BigInt(0) },
          { topicName: 'orders-audit', state: ShadowTopicState.FAULTED, totalLag: BigInt(0) },
        ],
        box: cloudReadiness('boxed', [0]).box,
      })
    );

    expect(screen.getByTestId('cutover-done')).toHaveTextContent('apart from orders-audit, which has faulted');
  });

  test('embedded, while the host is still resolving links, waits instead of calling the source external', () => {
    renderTab(
      getCutoverReadiness({
        topics: topics([0]),
        box: getSourceBoxStep({
          source: undefined,
          linkPrincipal: 'shadow-orders',
          topology: 'resolving',
          manuallyConfirmed: false,
        }),
      })
    );

    expect(screen.getByTestId('cutover-box-loading')).toHaveTextContent('Finding the cluster this link reads from');
    expect(screen.queryByTestId('cutover-admin-api-commands')).not.toBeInTheDocument();
  });
});
