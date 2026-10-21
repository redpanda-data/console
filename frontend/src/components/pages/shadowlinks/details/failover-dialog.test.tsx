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

import { getCutoverReadiness, getSourceBoxStep } from './cutover-model';
import { FailoverDialog } from './failover-dialog';

const readiness = (boxed: boolean, lag: number) =>
  getCutoverReadiness({
    topics: [{ topicName: 'orders-events', state: ShadowTopicState.ACTIVE, totalLag: BigInt(lag) }],
    box: getSourceBoxStep({
      source: {
        kind: 'cloud',
        clusterId: 'prod',
        clusterName: 'prod-us-east-1',
        box: {
          status: 'known',
          state: boxed ? 'boxed' : 'unboxed',
          revision: 3,
          exemptPrincipals: [],
          allowAllReads: true,
        },
      },
      linkPrincipal: 'shadow-orders',
      topology: 'resolved',
      manuallyConfirmed: false,
    }),
  });

const EXACTLY_FAIL_OVER = /^Fail over$/;

describe('FailoverDialog', () => {
  test('lists the safe order: stop writes and let lag drain first, repoint clients after', () => {
    render(<FailoverDialog onConfirm={rs.fn()} onOpenChange={rs.fn()} open readiness={readiness(true, 0)} />);

    expect(screen.getByText('Fail over all topics?')).toBeVisible();
    expect(screen.getByTestId('failover-check-source')).toHaveAttribute('data-status', 'ready');
    expect(screen.getByTestId('failover-check-lag')).toHaveAttribute('data-status', 'ready');
    expect(screen.getByText('Repoint producers and consumers to this cluster.')).toBeVisible();
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent(EXACTLY_FAIL_OVER);
  });

  test('still lets the user fail over when it isn’t safe, but says so', async () => {
    const user = userEvent.setup();
    const onConfirm = rs.fn();
    render(<FailoverDialog onConfirm={onConfirm} onOpenChange={rs.fn()} open readiness={readiness(false, 1204)} />);

    expect(screen.getByTestId('failover-check-source')).toHaveAttribute('data-status', 'not-ready');
    expect(screen.getByTestId('failover-check-lag')).toHaveTextContent('1 topic is still behind');
    await user.click(screen.getByTestId('confirm-failover'));
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent('Fail over anyway');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('a single topic is judged on its own lag', () => {
    render(
      <FailoverDialog
        onConfirm={rs.fn()}
        onOpenChange={rs.fn()}
        open
        readiness={readiness(true, 0)}
        topicName="orders-events"
      />
    );

    expect(screen.getByText('Fail over orders-events?')).toBeVisible();
    expect(screen.getByTestId('failover-check-lag')).toHaveTextContent('orders-events has caught up.');
  });

  test('while the topics load, leaves the lag check open rather than calling it ready', () => {
    render(
      <FailoverDialog
        onConfirm={rs.fn()}
        onOpenChange={rs.fn()}
        open
        readiness={getCutoverReadiness({ topics: undefined, box: readiness(true, 0).box })}
      />
    );

    expect(screen.getByTestId('failover-check-lag')).toHaveAttribute('data-status', 'unknown');
  });

  test('a faulted topic isn’t safe to fail over', () => {
    render(
      <FailoverDialog
        onConfirm={rs.fn()}
        onOpenChange={rs.fn()}
        open
        readiness={getCutoverReadiness({
          topics: [{ topicName: 'orders-audit', state: ShadowTopicState.FAULTED, totalLag: BigInt(0) }],
          box: readiness(true, 0).box,
        })}
        topicName="orders-audit"
      />
    );

    expect(screen.getByTestId('failover-check-lag')).toHaveTextContent('orders-audit has faulted');
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent('Fail over anyway');
  });

  test('a box that blocks this link’s reads isn’t safe to fail over behind', () => {
    const blocking = getSourceBoxStep({
      source: {
        kind: 'cloud',
        clusterId: 'prod',
        clusterName: 'prod-us-east-1',
        box: { status: 'known', state: 'boxed', revision: 3, exemptPrincipals: [], allowAllReads: false },
      },
      linkPrincipal: 'shadow-orders',
      topology: 'resolved',
      manuallyConfirmed: false,
    });
    render(
      <FailoverDialog
        onConfirm={rs.fn()}
        onOpenChange={rs.fn()}
        open
        readiness={getCutoverReadiness({
          topics: [{ topicName: 'orders-events', state: ShadowTopicState.ACTIVE, totalLag: BigInt(0) }],
          box: blocking,
        })}
      />
    );

    expect(screen.getByTestId('failover-check-source')).toHaveAttribute('data-status', 'not-ready');
    expect(screen.getByTestId('failover-check-source')).toHaveTextContent('blocks this link’s reads');
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent('Fail over anyway');
  });

  test('doesn’t call lag caught up when the last refresh failed', () => {
    render(
      <FailoverDialog
        onConfirm={rs.fn()}
        onOpenChange={rs.fn()}
        open
        readiness={getCutoverReadiness({
          topics: [{ topicName: 'orders-events', state: ShadowTopicState.ACTIVE, totalLag: BigInt(0) }],
          topicsFailed: true,
          box: readiness(true, 0).box,
        })}
      />
    );

    expect(screen.getByTestId('failover-check-lag')).toHaveAttribute('data-status', 'unknown');
    expect(screen.getByTestId('failover-check-lag')).toHaveTextContent('couldn’t refresh');
  });

  test('failing over every topic says a paused topic will be refused', () => {
    render(
      <FailoverDialog
        onConfirm={rs.fn()}
        onOpenChange={rs.fn()}
        open
        readiness={getCutoverReadiness({
          topics: [{ topicName: 'orders-events', state: ShadowTopicState.PAUSED, totalLag: BigInt(0) }],
          box: readiness(true, 0).box,
        })}
      />
    );

    expect(screen.getByTestId('failover-check-paused')).toHaveAttribute('data-status', 'not-ready');
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent('Fail over anyway');
  });

  test('once every topic has failed over, says so instead of offering another failover', () => {
    render(
      <FailoverDialog
        onConfirm={rs.fn()}
        onOpenChange={rs.fn()}
        open
        readiness={getCutoverReadiness({
          topics: [{ topicName: 'orders-events', state: ShadowTopicState.FAILED_OVER, totalLag: BigInt(0) }],
          box: readiness(true, 0).box,
        })}
      />
    );

    expect(screen.getByText('Every topic has failed over')).toBeVisible();
    expect(screen.queryByTestId('confirm-failover')).not.toBeInTheDocument();
  });

  test('waits for a fresh lag reading before it vouches for one', () => {
    render(
      <FailoverDialog checkingLag onConfirm={rs.fn()} onOpenChange={rs.fn()} open readiness={readiness(true, 0)} />
    );

    expect(screen.getByTestId('failover-check-lag')).toHaveAttribute('data-status', 'unknown');
    expect(screen.getByTestId('confirm-failover')).toBeDisabled();
  });

  test('without shadow boxing, keeps the original confirmation', () => {
    render(<FailoverDialog onConfirm={rs.fn()} onOpenChange={rs.fn()} open />);

    expect(screen.getByText('Confirm Failover', { selector: 'h2' })).toBeVisible();
    expect(screen.queryByTestId('failover-readiness')).not.toBeInTheDocument();
    expect(screen.getByTestId('confirm-failover')).toHaveTextContent('Confirm Failover');
  });
});
