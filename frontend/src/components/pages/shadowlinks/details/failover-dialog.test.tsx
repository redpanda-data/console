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

import { describe, expect, rs, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShadowTopicState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import type { ComponentProps } from 'react';

import { FailoverDialog } from './failover-dialog';
import { type CloudSource, getFailoverReadiness, getSourceBoxStep, type SourceBoxStep } from './failover-model';

const source = (state: 'boxed' | 'unboxed', allowAllReads: boolean): CloudSource => ({
  kind: 'cloud',
  clusterId: 'prod',
  clusterName: 'prod-us-east-1',
  box: { status: 'known', state, revision: '18', exemptPrincipals: [], allowAllReads, brokers: [] },
});

const sourceStep = (state: 'boxed' | 'unboxed', allowAllReads: boolean): SourceBoxStep => {
  const step = getSourceBoxStep({
    source: source(state, allowAllReads),
    link: { authentication: 'sasl', principal: 'shadow-orders' },
    resolving: false,
  });
  if (!step) {
    throw new Error('A known Cloud source always has a step');
  }
  return step;
};

const BOXED = sourceStep('boxed', true);

const topicIn = (state: ShadowTopicState, topicName = 'orders-events', lag = 0) => ({
  topicName,
  state,
  totalLag: BigInt(lag),
});

const readiness = (boxed: boolean, lag: number) =>
  getFailoverReadiness({
    topics: [topicIn(ShadowTopicState.ACTIVE, 'orders-events', lag)],
    box: boxed ? BOXED : sourceStep('unboxed', true),
  });

const renderDialog = (props: Partial<ComponentProps<typeof FailoverDialog>> = {}) =>
  render(<FailoverDialog onConfirm={rs.fn()} onOpenChange={rs.fn()} open {...props} />);

type ReadinessInput = Parameters<typeof getFailoverReadiness>[0];

const EXACTLY_FAIL_OVER = /^Fail over$/;

describe('the FailoverDialog', () => {
  test('lists the safe order: stop writes and let lag drain first, repoint clients after', () => {
    renderDialog({ readiness: readiness(true, 0) });

    expect(screen.getByText('Fail over all topics?')).toBeVisible();
    expect(screen.getByTestId('failover-check-source')).toHaveAttribute('data-status', 'ready');
    expect(screen.getByTestId('failover-check-lag')).toHaveAttribute('data-status', 'ready');
    expect(screen.getByText('Repoint producers and consumers to this cluster.')).toBeVisible();
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent(EXACTLY_FAIL_OVER);
  });

  test('still lets the user fail over when it isn’t safe, but says so', async () => {
    const user = userEvent.setup();
    const onConfirm = rs.fn();
    renderDialog({ onConfirm, readiness: readiness(false, 1204) });

    expect(screen.getByTestId('failover-check-source')).toHaveAttribute('data-status', 'not-ready');
    expect(screen.getByTestId('failover-check-lag')).toHaveTextContent('1 topic is still behind');
    await user.click(screen.getByTestId('confirm-failover'));
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent('Fail over anyway');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  describe('the readiness checks', () => {
    test('a single topic is judged on its own lag', () => {
      renderDialog({ readiness: readiness(true, 0), topicName: 'orders-events' });

      expect(screen.getByText('Fail over orders-events?')).toBeVisible();
      expect(screen.getByTestId('failover-check-lag')).toHaveTextContent('orders-events has caught up.');
    });

    test.each<[string, string, ReadinessInput, string]>([
      [
        'a faulted topic',
        'lag',
        { topics: [topicIn(ShadowTopicState.FAULTED, 'orders-audit')], box: BOXED },
        'orders-audit has faulted',
      ],
      [
        'a fence that blocks this link’s reads',
        'source',
        { topics: [topicIn(ShadowTopicState.ACTIVE)], box: sourceStep('boxed', false) },
        'block this link’s fetches',
      ],
      [
        'a paused topic, which Fail over all topics is refused for,',
        'paused',
        { topics: [topicIn(ShadowTopicState.PAUSED)], box: BOXED },
        'orders-events is paused',
      ],
    ])('%s isn’t safe to fail over', (_label, check, input, text) => {
      renderDialog({ readiness: getFailoverReadiness(input) });

      expect(screen.getByTestId(`failover-check-${check}`)).toHaveAttribute('data-status', 'not-ready');
      expect(screen.getByTestId(`failover-check-${check}`)).toHaveTextContent(text);
      expect(screen.getByTestId('confirm-failover')).toHaveTextContent('Fail over anyway');
    });

    test.each<[string, string, ReadinessInput]>([
      ['while the topics load', 'lag', { topics: undefined, box: BOXED }],
      [
        'when the last refresh failed',
        'lag',
        { topics: [topicIn(ShadowTopicState.ACTIVE)], topicsFailed: true, box: BOXED },
      ],
      [
        'while the host is still finding the source',
        'source',
        { topics: [], box: { kind: 'loading', source: undefined } },
      ],
      [
        'when the source’s fence can’t be read right now',
        'source',
        { topics: [], box: { kind: 'unreadable', source: source('boxed', true), reason: 'error' } },
      ],
    ])('%s, leaves the %s check to the user', (_label, check, input) => {
      renderDialog({ readiness: getFailoverReadiness(input) });

      expect(screen.getByTestId(`failover-check-${check}`)).toHaveAttribute('data-status', 'unknown');
    });

    test('waits for a fresh lag reading before it vouches for one', () => {
      renderDialog({ checkingLag: true, readiness: readiness(true, 0) });

      expect(screen.getByTestId('failover-check-lag')).toHaveAttribute('data-status', 'unknown');
      expect(screen.getByTestId('confirm-failover')).toBeDisabled();
    });
  });

  test('once every topic has failed over, says so instead of offering another failover', () => {
    renderDialog({ readiness: getFailoverReadiness({ topics: [topicIn(ShadowTopicState.FAILED_OVER)], box: BOXED }) });

    expect(screen.getByText('Every topic has failed over')).toBeVisible();
    expect(screen.queryByTestId('confirm-failover')).not.toBeInTheDocument();
  });

  test('without the Failover tab, keeps the original confirmation', () => {
    renderDialog();

    expect(screen.getByText('Confirm Failover', { selector: 'h2' })).toBeVisible();
    expect(screen.queryByTestId('failover-readiness')).not.toBeInTheDocument();
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent('Confirm Failover');
  });
});
