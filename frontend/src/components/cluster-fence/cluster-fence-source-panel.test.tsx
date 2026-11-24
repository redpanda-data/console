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
import { createQueryOptions } from '@connectrpc/connect-query';
import { beforeEach, describe, expect, test } from '@rstest/core';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import {
  ClusterFenceState,
  type GetClusterFenceStatusResponse,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { getClusterFenceBrokerStatus } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { renderWithFileRoutes } from 'test-utils';

import {
  enableFenceFixtures,
  fenceStatus,
  readFenceStatus,
  renderWithFenceStatus,
  serveFenceStatus,
} from './cluster-fence.test-utils';
import { ClusterFenceSourcePanel } from './cluster-fence-source-panel';
import type { ShadowLinkTopology } from './shadow-link-topology';

const NO_LEADER = new ConnectError('no controller leader', Code.Unavailable);
type InboundLink = { name: string; state: ShadowLinkState };

function serveSourcePanel(status: GetClusterFenceStatusResponse | ConnectError, links: InboundLink[] = []) {
  return serveFenceStatus(status, ({ rpc }) => {
    rpc(listShadowLinks, () => ({ shadowLinks: links }));
    rpc(getClusterFenceBrokerStatus, ({ nodeId }) => ({
      broker: { nodeId: nodeId ?? 1, fence: { state: ClusterFenceState.FENCED, revision: 18n } },
    }));
  });
}

function renderPanel(status = fenceStatus(ClusterFenceState.UNFENCED, 18n), links: InboundLink[] = []) {
  const { transport } = serveSourcePanel(status, links);
  return renderWithFenceStatus(<ClusterFenceSourcePanel />, transport);
}

function renderAt(initialLocation: string, phase = ClusterFenceState.UNFENCED) {
  const { transport } = serveSourcePanel(fenceStatus(phase, 18n));
  return renderWithFenceStatus(<ClusterFenceSourcePanel />, transport, initialLocation);
}

const brokerAt = (nodeId: number, state: ClusterFenceState, revision = 18n) => ({
  nodeId,
  fence: { state, revision },
});

const readers = [
  {
    linkName: 'orders-dr',
    shadowClusterId: 'dr',
    shadowClusterName: 'dr-us-west-2',
    authentication: 'sasl' as const,
    principal: 'shadow-orders',
  },
  {
    linkName: 'telemetry-dr',
    shadowClusterId: 'eu',
    shadowClusterName: 'telemetry-eu-dr',
    authentication: 'sasl' as const,
    principal: 'shadow-telemetry',
  },
  { linkName: 'edge-dr', shadowClusterId: 'edge', shadowClusterName: 'edge-dr', authentication: 'mtls' as const },
];

type OpenCluster = ReturnType<typeof useClusterFenceStore.getState>['openCluster'];

const setTopology = (overrides: Partial<ShadowLinkTopology> = {}, openCluster: OpenCluster = null) =>
  useClusterFenceStore.setState({
    openCluster,
    topology: {
      clusterName: 'prod-us-east-1',
      readers,
      sources: {},
      resolving: false,
      readersIncomplete: false,
      ...overrides,
    },
  });

const ERROR_CODE_NAMES = /REQUEST_TIMED_OUT|POLICY_VIOLATION|COORDINATOR_NOT_AVAILABLE/u;

describe('the ClusterFenceSourcePanel', () => {
  beforeEach(enableFenceFixtures);

  describe('its fence', () => {
    test('an unfenced cluster offers Fence and shows its state', async () => {
      await renderPanel();

      expect(screen.getByTestId('cluster-fence-state-badge')).toHaveTextContent('Unfenced');
      expect(screen.getByTestId('open-fence-cluster')).toBeVisible();
      expect(screen.queryByTestId('open-unfence-cluster')).not.toBeInTheDocument();
      expect(screen.getByTestId('cluster-fence-headline')).toHaveTextContent('Clients write and read as usual.');
    });

    test('fencing: each broker’s copy and status, and a broker that isn’t answering holds it with no timeout', async () => {
      const status = fenceStatus(ClusterFenceState.FENCING, 18n);
      await renderPanel(
        create(GetClusterFenceStatusResponseSchema, {
          fence: status.fence,
          brokers: [
            brokerAt(1, ClusterFenceState.FENCING),
            brokerAt(2, ClusterFenceState.UNFENCED, -1n),
            { nodeId: 3, errorMessage: 'rpc::errc::disconnected_endpoint(node down)' },
          ],
        })
      );

      expect(screen.getByTestId('open-unfence-cluster')).toBeVisible();
      expect(screen.getByTestId('cluster-fence-broker-1')).toHaveTextContent('Confirmed');
      expect(screen.getByTestId('cluster-fence-broker-2')).toHaveTextContent('Unfenced · revision -1');
      expect(screen.getByTestId('cluster-fence-broker-2')).toHaveTextContent('Behind');
      expect(screen.getByTestId('cluster-fence-broker-3')).toHaveTextContent('disconnected_endpoint');
      expect(screen.getByTestId('cluster-fence-headline')).toHaveTextContent(
        'Broker 3 isn’t answering, so the cluster stays fencing until it comes back or leaves the cluster. There’s no timeout.'
      );
      expect(screen.getByTestId('cluster-fence-effect-produce')).toHaveAttribute('data-verdict', 'partly');
    });

    test('fenced: what clients see, row by row, without naming error codes the cluster can change', async () => {
      const status = fenceStatus(ClusterFenceState.FENCED, 18n);
      await renderPanel(
        create(GetClusterFenceStatusResponseSchema, {
          fence: status.fence,
          brokers: [brokerAt(1, ClusterFenceState.FENCED), brokerAt(2, ClusterFenceState.FENCED)],
        })
      );

      expect(screen.getByTestId('cluster-fence-headline')).toHaveTextContent(
        'Every broker rejects writes. Only exempt users can read from user topics.'
      );
      expect(screen.getByTestId('cluster-fence-effect-produce')).toHaveTextContent('A producer writesRejected.');
      expect(screen.getByTestId('cluster-fence-effect-consume')).toHaveTextContent('Rejected.');
      expect(screen.getByTestId('cluster-fence-effect-schema')).toHaveTextContent('Rejected.');
      expect(screen.getByTestId('cluster-fence-client-effects')).not.toHaveTextContent(ERROR_CODE_NAMES);
      expect(screen.getByTestId('cluster-fence-effect-transaction')).toHaveTextContent('Ended: aborted');
      expect(screen.getByTestId('cluster-fence-read-policy')).toHaveTextContent('shadow-orders');
    });

    test('with no one exempt, says that the fence locks out every shadow link', async () => {
      await renderPanel(fenceStatus(ClusterFenceState.UNFENCED, 18n, []));

      expect(screen.getByTestId('cluster-fence-read-policy')).toHaveTextContent('No one');
      expect(screen.getByTestId('cluster-fence-policy-empty')).toHaveTextContent('every shadow link’s user');
    });

    test('an inbound shadow link blocks fencing only until it fails over', async () => {
      const { unmount } = await renderPanel(undefined, [{ name: 'inbound-dr', state: ShadowLinkState.ACTIVE }]);
      expect(
        await screen.findByText('hasn’t failed over, so it’s still a shadow cluster', { exact: false })
      ).toBeVisible();
      expect(screen.getByTestId('open-fence-cluster')).toBeDisabled();
      unmount();

      const failedOver = serveSourcePanel(fenceStatus(ClusterFenceState.UNFENCED, 18n), [
        { name: 'inbound-dr', state: ShadowLinkState.FAILED_OVER },
      ]);
      const { queryClient } = await renderWithFenceStatus(<ClusterFenceSourcePanel />, failedOver.transport);
      await act(async () => {
        await queryClient.fetchQuery(createQueryOptions(listShadowLinks, {}, { transport: failedOver.transport }));
      });
      expect(screen.getByTestId('open-fence-cluster')).toBeEnabled();
    });

    test('a failed refresh keeps the last status on screen, with a note', async () => {
      const server = serveSourcePanel(fenceStatus(ClusterFenceState.FENCED, 18n));
      const { queryClient } = await renderWithFenceStatus(<ClusterFenceSourcePanel />, server.transport);
      server.publish(NO_LEADER);
      await act(async () => {
        await expect(readFenceStatus(queryClient, server.transport)).rejects.toThrow('no controller leader');
      });

      expect(await screen.findByTestId('cluster-fence-status-stale')).toHaveTextContent(
        'no controller leader right now'
      );
      expect(screen.getByTestId('cluster-fence-status-card')).toBeVisible();
      expect(screen.queryByTestId('cluster-fence-status-error')).not.toBeInTheDocument();
    });

    test('when the controller can’t answer, shows a broker’s own copy and recovers on retry', async () => {
      const user = userEvent.setup();
      const server = serveSourcePanel(NO_LEADER);
      renderWithFileRoutes(<ClusterFenceSourcePanel />, { transport: server.transport });

      expect(await screen.findByTestId('cluster-fence-status-error')).toHaveTextContent(
        'no controller leader right now'
      );
      expect(await screen.findByText('Broker 1: Fenced, revision 18')).toBeVisible();
      server.publish(fenceStatus(ClusterFenceState.FENCED, 19n));
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByTestId('cluster-fence-since')).toHaveTextContent('revision 19');
    });

    test('a viewer without permission is told why the fence can’t be shown', async () => {
      const { transport } = serveSourcePanel(new ConnectError('denied', Code.PermissionDenied));
      renderWithFileRoutes(<ClusterFenceSourcePanel />, { transport });

      expect(await screen.findByTestId('cluster-fence-forbidden')).toHaveTextContent(
        'You don’t have permission to view this cluster’s fence'
      );
    });
  });

  describe('the links that read from the cluster', () => {
    test('without Cloud’s inventory, self-hosted Console shows no list of readers', async () => {
      await renderPanel();

      expect(screen.getByTestId('cluster-fence-source-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('cluster-fence-readers')).not.toBeInTheDocument();
    });

    test('embedded, lists Cloud’s readers and whether the settings let each read', async () => {
      setTopology();
      await renderPanel(fenceStatus(ClusterFenceState.FENCED, 18n));

      expect(screen.getByTestId('cluster-fence-reader-orders-dr')).toHaveTextContent('Can read');
      expect(screen.getByTestId('cluster-fence-reader-telemetry-dr')).toHaveTextContent('Blocked');
      expect(screen.getByTestId('cluster-fence-reader-edge-dr')).toHaveTextContent('mTLS certificate');
      expect(screen.getByTestId('cluster-fence-reader-edge-dr')).toHaveTextContent('Can’t check');
      expect(screen.getByTestId('cluster-fence-effect-link-telemetry-dr')).toHaveAttribute('data-verdict', 'rejected');
    });

    test('embedded, a reader’s name opens its Failover tab on the shadow cluster', async () => {
      const user = userEvent.setup();
      const opened: Array<{ cluster: string; path: string }> = [];
      setTopology({}, (cluster, path) => {
        opened.push({ cluster, path });
      });
      await renderPanel(fenceStatus(ClusterFenceState.FENCED, 18n));

      await user.click(screen.getByRole('button', { name: 'orders-dr' }));
      expect(opened).toEqual([{ cluster: 'dr', path: '/shadowlinks/orders-dr?tab=failover' }]);
    });

    test.each([
      ['still finding links', { resolving: true }, 'cluster-fence-readers-loading'],
      ['couldn’t check every link', { readersIncomplete: true }, 'cluster-fence-readers-incomplete'],
    ])('embedded, when Cloud is %s, doesn’t say that none read from the cluster', async (_label, overrides, testId) => {
      setTopology({ readers: [], ...overrides });
      await renderPanel();

      expect(screen.getByTestId(testId)).toBeVisible();
      expect(screen.queryByText('No links read from this cluster')).not.toBeInTheDocument();
    });
  });

  describe('a link that opens a dialog', () => {
    test('opens the settings with the user already added, so Save is all that’s left', async () => {
      await renderAt('/shadowlinks?tab=source&action=exempt&principal=shadow-telemetry');

      expect(await screen.findByTestId('cluster-fence-exempt-principals-chip-shadow-telemetry')).toBeVisible();
      expect(screen.getByTestId('cluster-fence-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.getByTestId('save-cluster-fence-settings')).toBeEnabled();
    });

    test.each([
      ['quoted, as a router writes a name that reads as JSON', '%221001%22'],
      ['unquoted', '1001'],
    ])('adds a user named like a number, %s', async (_how, written) => {
      await renderAt(`/shadowlinks?tab=source&action=exempt&principal=${written}`);

      expect(await screen.findByTestId('cluster-fence-exempt-principals-chip-1001')).toBeVisible();
    });

    test.each([
      ['fence', ClusterFenceState.UNFENCED, 'fence-cluster-dialog'],
      ['unfence', ClusterFenceState.FENCED, 'unfence-cluster-dialog'],
    ] as const)('%s on a cluster that’s %s opens its dialog', async (action, phase, testId) => {
      await renderAt(`/shadowlinks?tab=source&action=${action}`, phase);

      expect(await screen.findByTestId(testId)).toBeVisible();
    });

    test('unfence on a cluster that’s already unfenced does nothing', async () => {
      await renderAt('/shadowlinks?tab=source&action=unfence');

      expect(await screen.findByTestId('cluster-fence-source-panel')).toBeVisible();
      expect(screen.queryByTestId('unfence-cluster-dialog')).not.toBeInTheDocument();
    });

    test.each([
      ['exempt', ClusterFenceState.UNFENCED, 'cluster-fence-settings-dialog'],
      ['unfence', ClusterFenceState.FENCED, 'unfence-cluster-dialog'],
    ] as const)(
      'clears %s from the URL once its dialog closes, so it doesn’t open again',
      async (action, phase, testId) => {
        const user = userEvent.setup();
        const { router } = await renderAt(`/shadowlinks?tab=source&action=${action}&principal=shadow-telemetry`, phase);

        await user.click(await screen.findByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'source' }));
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
    );

    test('ignores any other action', async () => {
      await renderAt('/shadowlinks?tab=source&action=archive&principal=shadow-telemetry');

      expect(await screen.findByTestId('cluster-fence-source-panel')).toBeVisible();
      expect(screen.queryByTestId('cluster-fence-settings-dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('fence-cluster-dialog')).not.toBeInTheDocument();
    });
  });
});
