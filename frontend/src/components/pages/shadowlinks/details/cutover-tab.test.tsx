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
import type { LinkIdentity } from 'components/shadow-box/shadow-box-model';
import type { ShadowLinkPeerBoxBroker, ShadowLinkPeerBoxState, ShadowLinkSource } from 'federation/types';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import { type CutoverTopic, getCutoverReadiness, getSourceBoxStep, type TopologyState } from './cutover-model';
import { CutoverTab } from './cutover-tab';
import type { UnifiedShadowLink } from '../model';

const link = { name: 'orders-dr' } as UnifiedShadowLink;

const sasl: LinkIdentity = { authentication: 'sasl', principal: 'shadow-orders' };

const topics = (lags: number[]): CutoverTopic[] =>
  lags.map((lag, index) => ({
    topicName: index === 0 ? 'orders-events' : `orders-${index}`,
    state: ShadowTopicState.ACTIVE,
    totalLag: BigInt(lag),
  }));

const cloudSource = (
  state: ShadowLinkPeerBoxState,
  exemptPrincipals = ['shadow-orders'],
  brokers: ShadowLinkPeerBoxBroker[] = []
): ShadowLinkSource => ({
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
    brokers,
  },
});

const readinessFor = (
  source: ShadowLinkSource | undefined,
  cutoverTopics: CutoverTopic[] | undefined,
  {
    identity = sasl,
    topicsFailed = false,
    topology = 'resolved',
  }: { identity?: LinkIdentity; topicsFailed?: boolean; topology?: TopologyState } = {}
) =>
  getCutoverReadiness({
    topics: cutoverTopics,
    topicsFailed,
    box: getSourceBoxStep({ source, link: identity, topology, manuallyConfirmed: false }),
  });

const cloudReadiness = (state: ShadowLinkPeerBoxState, lags: number[], exemptPrincipals = ['shadow-orders']) =>
  readinessFor(cloudSource(state, exemptPrincipals), topics(lags));

const renderTab = (
  readiness: ReturnType<typeof getCutoverReadiness>,
  {
    onFailoverAll = rs.fn(),
    onRetryTopics = rs.fn(),
    onManualConfirmChange = rs.fn(),
    identity = sasl,
  }: {
    onFailoverAll?: () => void;
    onRetryTopics?: () => void;
    onManualConfirmChange?: (confirmed: boolean) => void;
    identity?: LinkIdentity;
  } = {}
) =>
  render(
    <CutoverTab
      isFailingOver={false}
      linkIdentity={identity}
      onFailoverAll={onFailoverAll}
      onManualConfirmChange={onManualConfirmChange}
      onRetryTopics={onRetryTopics}
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

  test('lays the six steps out in two lanes: three on the source, three here', () => {
    renderTab(cloudReadiness('unboxed', [0, 0]));

    expect(screen.getByText('Cut over from prod-us-east-1')).toBeVisible();
    const source = screen.getByTestId('cutover-lane-source');
    expect(source).toHaveTextContent('On prod-us-east-1');
    expect(within(source).getByTestId('cutover-step-settings')).toBeVisible();
    expect(within(source).getByTestId('cutover-step-box')).toBeVisible();
    expect(within(source).getByTestId('cutover-step-boxed')).toBeVisible();
    const shadow = screen.getByTestId('cutover-lane-shadow');
    expect(shadow).toHaveTextContent('On dr-us-west-2');
    expect(within(shadow).getByTestId('cutover-step-lag')).toBeVisible();
    expect(within(shadow).getByTestId('cutover-step-failover')).toBeVisible();
    expect(within(shadow).getByTestId('cutover-step-clients')).toBeVisible();
    expect(screen.getByTestId('cutover-tab')).toHaveTextContent('Don’t skip the settings');
  });

  test('with the link exempt, Box is next; it opens the source, where Box runs', async () => {
    const user = userEvent.setup();
    renderTab(cloudReadiness('unboxed', [0, 0]));

    expect(screen.getByTestId('cutover-step-settings')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('cutover-step-box')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
    expect(screen.getByTestId('cutover-failover-reason')).toHaveTextContent(
      'Available once the source cluster reports Boxed.'
    );

    await user.click(screen.getByTestId('cutover-open-source'));
    expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source&action=box');
  });

  test('before boxing, settings that would block this link come first: exempt its user on the source', async () => {
    const user = userEvent.setup();
    renderTab(cloudReadiness('unboxed', [5], []));

    expect(screen.getByTestId('cutover-step-settings')).toHaveAttribute('data-state', 'attention');
    expect(screen.getByTestId('cutover-link-not-exempt')).toHaveTextContent('Once the source is boxed');
    expect(screen.getByTestId('cutover-open-source')).toBeDisabled();

    await user.click(screen.getByTestId('cutover-exempt-link'));
    expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source&action=exempt&principal=shadow-orders');
  });

  test('once boxed with the link blocked, says its fetches are rejected and that saving reboxes', () => {
    renderTab(cloudReadiness('boxed', [0], []));

    expect(screen.getByTestId('cutover-link-not-exempt')).toHaveTextContent('Its brokers reject this link’s fetches');
    expect(screen.getByTestId('cutover-link-not-exempt')).toHaveTextContent('writes stay blocked the whole time');
    expect(screen.getByTestId('cutover-step-lag')).toHaveTextContent('Link can’t read');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('while boxing, waits for Boxed and names a broker that holds it', () => {
    renderTab(
      readinessFor(
        cloudSource(
          'boxing',
          ['shadow-orders'],
          [
            { nodeId: 1, status: 'confirmed' },
            { nodeId: 2, status: 'not-answering' },
          ]
        ),
        topics([3])
      )
    );

    expect(screen.getByTestId('cutover-step-box')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('cutover-step-boxed')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('cutover-boxing-progress')).toHaveTextContent('1 of 2 brokers have confirmed.');
    expect(screen.getByTestId('cutover-boxing-progress')).toHaveTextContent('Broker 2 isn’t answering');
    expect(screen.getByTestId('cutover-boxing-progress')).toHaveTextContent('There’s no timeout.');
  });

  test('once the source is boxed, offers to open or unbox it there', async () => {
    const user = userEvent.setup();
    renderTab(cloudReadiness('boxed', [5]));

    await user.click(screen.getByTestId('cutover-unbox-source'));
    expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source&action=unbox');
    await user.click(screen.getByTestId('cutover-view-source'));
    expect(openCluster).toHaveBeenLastCalledWith('prod', '/shadowlinks?tab=source');
  });

  test('while lag drains, names the topic furthest behind', () => {
    renderTab(cloudReadiness('boxed', [1204, 0, 0]));

    expect(screen.getByTestId('cutover-step-boxed')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('cutover-step-lag')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('cutover-lag-summary')).toHaveTextContent(
      '2 of 3 topics caught up. orders-events is 1,204 messages behind.'
    );
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('unlocks failover once the source is boxed and every topic has caught up', async () => {
    const user = userEvent.setup();
    const onFailoverAll = rs.fn();
    renderTab(cloudReadiness('boxed', [0, 0]), { onFailoverAll });

    expect(screen.getByTestId('cutover-step-failover')).toHaveAttribute('data-state', 'current');
    await user.click(screen.getByTestId('cutover-failover-all'));
    expect(onFailoverAll).toHaveBeenCalledTimes(1);
  });

  test('for an mTLS link, says Console can’t check the exempt list', () => {
    renderTab(
      readinessFor(cloudSource('boxed', ['shadow-orders']), topics([0]), { identity: { authentication: 'mtls' } }),
      {
        identity: { authentication: 'mtls' },
      }
    );

    expect(screen.getByTestId('cutover-link-principal-unknown')).toHaveTextContent('mapping rules');
  });

  test('a link without SASL or mTLS is exempted with the empty name', async () => {
    const user = userEvent.setup();
    const identity: LinkIdentity = { authentication: 'none' };
    renderTab(readinessFor(cloudSource('unboxed', ['shadow-orders']), topics([0]), { identity }), { identity });

    await user.click(screen.getByTestId('cutover-exempt-link'));
    expect(openCluster).toHaveBeenCalledWith('prod', '/shadowlinks?tab=source&action=exempt&principal=');
  });

  test('when a refresh fails, keeps the last lag on screen but marks it out of date and locks failover', async () => {
    const user = userEvent.setup();
    const onRetryTopics = rs.fn();
    renderTab(readinessFor(cloudSource('boxed'), topics([0, 0]), { topicsFailed: true }), { onRetryTopics });

    expect(screen.getByTestId('cutover-lag-stale')).toBeVisible();
    expect(screen.getByTestId('cutover-lag-summary')).toHaveTextContent('2 of 2 topics caught up.');
    expect(screen.getByTestId('cutover-step-lag')).toHaveTextContent('Out of date');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
    await user.click(screen.getByTestId('cutover-lag-retry'));
    expect(onRetryTopics).toHaveBeenCalledTimes(1);
  });

  test('while topics are still failing over, says so and keeps moving clients for later', () => {
    renderTab(
      readinessFor(cloudSource('boxed'), [
        { topicName: 'orders-events', state: ShadowTopicState.FAILED_OVER, totalLag: BigInt(0) },
        { topicName: 'orders-audit', state: ShadowTopicState.FAILING_OVER, totalLag: BigInt(0) },
      ])
    );

    expect(screen.queryByTestId('cutover-done')).not.toBeInTheDocument();
    expect(screen.getByTestId('cutover-step-failover')).toHaveTextContent('Failing over');
    expect(screen.getByTestId('cutover-failover-reason')).toHaveTextContent('Failing over 1 topic…');
    expect(screen.getByTestId('cutover-step-clients')).toHaveAttribute('data-state', 'pending');
  });

  test('without a readable source box, gives each source step its Admin API call and a manual confirmation', async () => {
    const user = userEvent.setup();
    const onManualConfirmChange = rs.fn();
    renderTab(readinessFor({ kind: 'external', bootstrapServers: ['kafka-01.corp.example:9092'] }, topics([0])), {
      onManualConfirmChange,
    });

    expect(screen.getByTestId('cutover-manual-reason')).toHaveTextContent('kafka-01.corp.example:9092');
    expect(screen.getByTestId('cutover-admin-api-settings')).toHaveTextContent('"exemptPrincipals":["shadow-orders"]');
    expect(screen.getByTestId('cutover-admin-api-settings')).toHaveTextContent(
      '"updateMask":"readPolicy.exemptPrincipals"'
    );
    expect(screen.getByTestId('cutover-admin-api-settings')).toHaveTextContent('admin_api_require_auth');
    expect(screen.getByTestId('cutover-admin-api-box')).toHaveTextContent('ShadowBoxService/Box');
    expect(screen.getByTestId('cutover-admin-api-status')).toHaveTextContent('SHADOW_BOX_STATE_BOXED');
    await user.click(screen.getByTestId('cutover-source-boxed-confirmation'));
    expect(onManualConfirmChange).toHaveBeenCalledWith(true);
  });

  test('a source Cloud can’t read says why', () => {
    renderTab(
      readinessFor(
        { kind: 'cloud', clusterId: 'prod', clusterName: 'prod', box: { status: 'unavailable', reason: 'forbidden' } },
        topics([0])
      )
    );

    expect(screen.getByTestId('cutover-manual-reason')).toHaveTextContent('Only superusers can read');
  });

  test('after failover, moving clients is the last step: repoint them and leave the source boxed', () => {
    renderTab(
      readinessFor(cloudSource('boxed'), [
        { topicName: 'orders-events', state: ShadowTopicState.FAILED_OVER, totalLag: BigInt(0) },
      ])
    );

    expect(screen.getByTestId('cutover-done')).toHaveTextContent('Every topic of orders-dr has failed over');
    expect(screen.getByTestId('cutover-step-clients')).toHaveAttribute('data-state', 'current');
    expect(screen.getByTestId('cutover-move-clients')).toHaveTextContent(
      'Repoint producers and consumers to dr-us-west-2.'
    );
    expect(screen.getByTestId('cutover-move-clients')).toHaveTextContent('Leave prod-us-east-1 boxed');
    expect(screen.queryByTestId('cutover-failover-all')).not.toBeInTheDocument();
  });

  test('while the topics load, claims nothing about lag', () => {
    renderTab(readinessFor(cloudSource('boxed'), undefined));

    expect(screen.getByTestId('cutover-lag-loading')).toBeVisible();
    expect(screen.queryByTestId('cutover-lag-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('cutover-step-lag')).not.toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('when the topics can’t load, says so and offers a retry', async () => {
    const user = userEvent.setup();
    const onRetryTopics = rs.fn();
    renderTab(readinessFor(cloudSource('boxed'), undefined, { topicsFailed: true }), { onRetryTopics });

    expect(screen.getByTestId('cutover-lag-error')).toHaveTextContent('Couldn’t load the link’s topics');
    expect(screen.getByTestId('cutover-failover-reason')).toHaveTextContent('Couldn’t load the link’s topics');
    await user.click(screen.getByTestId('cutover-lag-retry'));
    expect(onRetryTopics).toHaveBeenCalledTimes(1);
  });

  test('a faulted topic keeps failover locked and names the topic', () => {
    renderTab(
      readinessFor(cloudSource('boxed'), [
        { topicName: 'orders-events', state: ShadowTopicState.ACTIVE, totalLag: BigInt(0) },
        { topicName: 'orders-audit', state: ShadowTopicState.FAULTED, totalLag: BigInt(0) },
      ])
    );

    expect(screen.getByTestId('cutover-faulted-topics')).toHaveTextContent('orders-audit has faulted');
    expect(screen.getByTestId('cutover-step-lag')).toHaveTextContent('Topics faulted');
    expect(screen.getByTestId('cutover-failover-all')).toBeDisabled();
  });

  test('a failover that left a faulted topic behind still finishes', () => {
    renderTab(
      readinessFor(cloudSource('boxed'), [
        { topicName: 'orders-events', state: ShadowTopicState.FAILED_OVER, totalLag: BigInt(0) },
        { topicName: 'orders-audit', state: ShadowTopicState.FAULTED, totalLag: BigInt(0) },
      ])
    );

    expect(screen.getByTestId('cutover-done')).toHaveTextContent('apart from orders-audit, which has faulted');
  });

  test('embedded, while the host is still resolving links, waits instead of calling the source external', () => {
    renderTab(readinessFor(undefined, topics([0]), { topology: 'resolving' }));

    expect(screen.getByTestId('cutover-box-loading')).toHaveTextContent('Finding the cluster this link reads from');
    expect(screen.queryByTestId('cutover-admin-api-settings')).not.toBeInTheDocument();
  });
});
