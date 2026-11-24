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
import { Code, ConnectError } from '@connectrpc/connect';
import { beforeEach, expect, test } from '@rstest/core';
import { act, screen } from '@testing-library/react';
import {
  ClusterFenceState,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { getClusterFenceBrokerStatus } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { renderWithFileRoutes } from 'test-utils';

import {
  enableFenceFixtures,
  fenceStatus,
  readFenceStatus,
  renderWithFenceStatus,
  serveFenceStatus,
} from './cluster-fence.test-utils';
import { ClusterFenceBanner } from './cluster-fence-banner';

beforeEach(enableFenceFixtures);

const BANNER = 'cluster-fence-banner';
const NO_LEADER = new ConnectError('no controller leader', Code.Unavailable);
const WAITING_FOR_BROKERS = /until every broker answers/iu;

test('hides the banner when unfenced and on the Cluster fence tab', async () => {
  const unfenced = serveFenceStatus(fenceStatus(ClusterFenceState.UNFENCED));
  const { unmount } = await renderWithFenceStatus(<ClusterFenceBanner />, unfenced.transport);
  expect(screen.queryByTestId(BANNER)).not.toBeInTheDocument();
  unmount();

  const fenced = serveFenceStatus(fenceStatus(ClusterFenceState.FENCED));
  await renderWithFenceStatus(<ClusterFenceBanner />, fenced.transport, '/shadowlinks?tab=source');
  expect(screen.queryByTestId(BANNER)).not.toBeInTheDocument();
});

test('a fenced cluster links to its fence status and explains rejected writes', async () => {
  const { transport } = serveFenceStatus(fenceStatus(ClusterFenceState.FENCED));
  await renderWithFenceStatus(<ClusterFenceBanner />, transport);

  const banner = screen.getByTestId(BANNER);
  expect(banner).toHaveTextContent('This cluster is fenced');
  expect(banner).toHaveTextContent('Every broker rejects writes.');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View fence status' })).toHaveAttribute('href', '/shadowlinks?tab=source');
});

test.each([
  [ClusterFenceState.FENCING, ClusterFenceState.UNFENCED, 'This cluster is being fenced'],
  [ClusterFenceState.FENCING, ClusterFenceState.FENCED, 'applying new fence settings'],
  [ClusterFenceState.UNFENCING, ClusterFenceState.FENCED, 'This cluster is being unfenced'],
] as const)('explains a transition from the controller and broker revisions: %s, %s', async (phase, broker, title) => {
  const response = create(GetClusterFenceStatusResponseSchema, {
    fence: fenceStatus(phase).fence,
    brokers: [{ nodeId: 2, fence: { state: broker, revision: 3n } }],
  });
  const { transport } = serveFenceStatus(response);
  await renderWithFenceStatus(<ClusterFenceBanner />, transport);
  expect(screen.getByTestId(BANNER)).toHaveTextContent(title);
});

test('warns when the saved policy exempts nobody', async () => {
  const { transport } = serveFenceStatus(fenceStatus(ClusterFenceState.FENCED, 4n, []));
  await renderWithFenceStatus(<ClusterFenceBanner />, transport);
  expect(screen.getByTestId(BANNER)).toHaveTextContent('No one is exempt');
});

test('reads a broker’s own copy when the cluster has no controller leader', async () => {
  const { transport } = serveFenceStatus(NO_LEADER, ({ rpc }) => {
    rpc(getClusterFenceBrokerStatus, () => ({
      broker: { nodeId: 1, fence: { state: ClusterFenceState.FENCED, revision: 4n } },
    }));
  });
  renderWithFileRoutes(<ClusterFenceBanner />, { transport });

  const banner = await screen.findByTestId(BANNER);
  expect(banner).toHaveTextContent('This cluster may be fenced');
  expect(banner).toHaveTextContent('broker 1 reports fenced. Writes to those brokers are rejected.');
  expect(screen.queryByRole('link', { name: 'View fence status' })).not.toBeInTheDocument();
});

test('retains the last fence status until it can read a broker copy', async () => {
  const { fence } = fenceStatus(ClusterFenceState.FENCED);
  const response = create(GetClusterFenceStatusResponseSchema, { fence, brokers: [{ nodeId: 1, fence }] });
  const brokerIds: (number | undefined)[] = [];
  const server = serveFenceStatus(response, ({ rpc }) => {
    rpc(getClusterFenceBrokerStatus, ({ nodeId }) => {
      brokerIds.push(nodeId);
      return { broker: { nodeId: 1 } };
    });
  });
  const { queryClient } = await renderWithFenceStatus(<ClusterFenceBanner />, server.transport);
  server.publish(NO_LEADER);
  await act(async () => {
    await expect(readFenceStatus(queryClient, server.transport)).rejects.toThrow('no controller leader');
  });

  expect(await screen.findByText(WAITING_FOR_BROKERS)).toHaveTextContent('last status it read: fenced');
  expect(brokerIds).toContain(1);
});
