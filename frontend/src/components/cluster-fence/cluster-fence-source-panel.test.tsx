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

import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShadowLinkTopology } from 'federation/types';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { renderWithFileRoutes } from 'test-utils';

rs.mock('react-query/api/cluster-fence', () => {
  const actual = rs.requireActual<typeof import('react-query/api/cluster-fence')>('react-query/api/cluster-fence');
  const mutation = { mutate: rs.fn(), reset: rs.fn(), isPending: false, error: null };
  return {
    ...actual,
    useClusterFenceStatusQuery: rs.fn(),
    useFenceClusterMutation: rs.fn(() => mutation),
    useUnfenceClusterMutation: rs.fn(() => mutation),
    useUpdateClusterFenceSettingsMutation: rs.fn(() => mutation),
  };
});
rs.mock('react-query/api/shadowlink', () => ({
  useListShadowLinksQuery: rs.fn(() => ({ data: { shadowLinks: [] } })),
}));

import { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';

import { type BrokerProgress, type FencePhase, isBlockingPhase } from './cluster-fence-model';
import { ClusterFenceSourcePanel } from './cluster-fence-source-panel';

const mockStatus = (
  phase: FencePhase,
  brokers: BrokerProgress[] = [],
  exemptPrincipals = ['shadow-orders'],
  error: unknown = null
) =>
  rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
    isLoading: false,
    error,
    data: {},
    dataUpdatedAt: Date.UTC(2026, 9, 19, 14, 5),
    refetch: rs.fn(),
    isRefetching: false,
    known: true,
    available: true,
    access: 'ok',
    unreadable: false,
    ownCopies: [],
    blocking: isBlockingPhase(phase),
    summary: {
      phase,
      revision: 18n,
      stateChangedAt: new Date(Date.now() - 12 * 60 * 1000),
      exemptPrincipals,
      allowAllReads: false,
    },
    brokers,
  } as unknown as ReturnType<typeof useClusterFenceStatusQuery>);

const confirmed = (nodeId: number, phase: FencePhase = 'fenced'): BrokerProgress => ({
  nodeId,
  status: 'confirmed',
  copy: { phase, revision: 18n },
  blocks: isBlockingPhase(phase),
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

const setTopology = (overrides: Partial<ShadowLinkTopology> = {}, openCluster = rs.fn()) =>
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

/** Kafka error names the fence returns by default; clusters can configure others. */
const ERROR_CODE_NAMES = /REQUEST_TIMED_OUT|POLICY_VIOLATION|COORDINATOR_NOT_AVAILABLE/;

describe('the ClusterFenceSourcePanel', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(useListShadowLinksQuery).mockReturnValue({ data: { shadowLinks: [] } } as unknown as ReturnType<
      typeof useListShadowLinksQuery
    >);
    useClusterFenceStore.setState({ topology: null, openCluster: null });
  });

  describe('its fence', () => {
    test('an unfenced cluster offers Fence and shows its state', () => {
      mockStatus('unfenced', [confirmed(1, 'unfenced')]);
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      expect(screen.getByTestId('cluster-fence-state-badge')).toHaveTextContent('Unfenced');
      expect(screen.getByTestId('open-fence-cluster')).toBeVisible();
      expect(screen.queryByTestId('open-unfence-cluster')).not.toBeInTheDocument();
      expect(screen.getByTestId('cluster-fence-headline')).toHaveTextContent('Clients write and read as usual.');
    });

    test('fencing: each broker’s copy and status, and a broker that isn’t answering holds it with no timeout', () => {
      mockStatus('fencing', [
        confirmed(1, 'fencing'),
        { nodeId: 2, status: 'behind', copy: { phase: 'unfenced', revision: -1n }, blocks: false },
        {
          nodeId: 3,
          status: 'not-answering',
          blocks: undefined,
          errorMessage: 'rpc::errc::disconnected_endpoint(node down)',
        },
      ]);
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

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

    test('fenced: what clients see, row by row, without naming error codes the cluster can change', () => {
      mockStatus('fenced', [confirmed(1), confirmed(2)]);
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

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

    test('with no one exempt, says once, loudly, that the fence locks out every shadow link', () => {
      mockStatus('unfenced', [], []);
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      expect(screen.getByTestId('cluster-fence-read-policy')).toHaveTextContent('No one');
      expect(screen.getByTestId('cluster-fence-policy-empty')).toHaveTextContent('every shadow link’s user');
    });

    test('a cluster with a shadow link that hasn’t failed over can’t be fenced; one that has failed over can', () => {
      rs.mocked(useListShadowLinksQuery).mockReturnValue({
        data: { shadowLinks: [{ name: 'inbound-dr', state: ShadowLinkState.ACTIVE }] },
      } as unknown as ReturnType<typeof useListShadowLinksQuery>);
      mockStatus('unfenced');
      const { unmount } = renderWithFileRoutes(<ClusterFenceSourcePanel />);
      expect(screen.getByTestId('open-fence-cluster')).toBeDisabled();
      expect(
        screen.getByText('hasn’t failed over, so it’s still a shadow cluster', { exact: false })
      ).toBeInTheDocument();
      unmount();

      rs.mocked(useListShadowLinksQuery).mockReturnValue({
        data: { shadowLinks: [{ name: 'inbound-dr', state: ShadowLinkState.FAILED_OVER }] },
      } as unknown as ReturnType<typeof useListShadowLinksQuery>);
      renderWithFileRoutes(<ClusterFenceSourcePanel />);
      expect(screen.getByTestId('open-fence-cluster')).toBeEnabled();
    });

    test('a failed refresh keeps the last status on screen, with a note', () => {
      mockStatus('fenced', [], ['shadow-orders'], new ConnectError('no controller leader', Code.Unavailable));
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      expect(screen.getByTestId('cluster-fence-status-stale')).toHaveTextContent('no controller leader right now');
      expect(screen.getByTestId('cluster-fence-status-card')).toBeVisible();
      expect(screen.queryByTestId('cluster-fence-status-error')).not.toBeInTheDocument();
    });

    test('when the status can’t load, shows each broker’s own copy and offers a retry', async () => {
      const user = userEvent.setup();
      const refetch = rs.fn();
      rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
        isLoading: false,
        error: new ConnectError('no controller leader', Code.Unavailable),
        refetch,
        isRefetching: false,
        known: false,
        access: 'ok',
        unreadable: false,
        ownCopies: [{ nodeId: 1, phase: 'fenced', revision: 18n }],
        summary: { phase: 'unfenced' },
        brokers: [],
      } as unknown as ReturnType<typeof useClusterFenceStatusQuery>);
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      expect(screen.getByTestId('cluster-fence-status-error')).toHaveTextContent('no controller leader right now');
      expect(screen.getByTestId('cluster-fence-own-copies')).toHaveTextContent('Broker 1: Fenced, revision 18');
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(refetch).toHaveBeenCalled();
    });

    test('a viewer without permission is told why the fence can’t be shown', () => {
      rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
        isLoading: false,
        error: new ConnectError('denied', Code.PermissionDenied),
        known: false,
        access: 'forbidden',
        summary: { phase: 'unfenced' },
        brokers: [],
        ownCopies: [],
      } as unknown as ReturnType<typeof useClusterFenceStatusQuery>);
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      expect(screen.getByTestId('cluster-fence-forbidden')).toHaveTextContent(
        'You don’t have permission to view this cluster’s fence'
      );
    });
  });

  describe('the links that read from the cluster', () => {
    test('without the host, as in self-hosted Console, shows no list of links: Redpanda doesn’t record them', () => {
      mockStatus('unfenced');
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      expect(screen.getByTestId('cluster-fence-source-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('cluster-fence-readers')).not.toBeInTheDocument();
    });

    test('embedded, lists Cloud’s readers and whether the settings let each read', () => {
      setTopology();
      mockStatus('fenced');
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      expect(screen.getByTestId('cluster-fence-reader-orders-dr')).toHaveTextContent('Can read');
      expect(screen.getByTestId('cluster-fence-reader-telemetry-dr')).toHaveTextContent('Blocked');
      expect(screen.getByTestId('cluster-fence-reader-edge-dr')).toHaveTextContent('mTLS certificate');
      expect(screen.getByTestId('cluster-fence-reader-edge-dr')).toHaveTextContent('Can’t check');
      expect(screen.getByTestId('cluster-fence-effect-link-telemetry-dr')).toHaveAttribute('data-verdict', 'rejected');
    });

    test('embedded, a reader’s name opens its Failover tab on the shadow cluster', async () => {
      const user = userEvent.setup();
      const openCluster = rs.fn();
      setTopology({}, openCluster);
      mockStatus('fenced');
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      await user.click(screen.getByRole('button', { name: 'orders-dr' }));
      expect(openCluster).toHaveBeenCalledWith('dr', '/shadowlinks/orders-dr?tab=failover');
    });

    test.each([
      ['still finding links', { resolving: true }, 'cluster-fence-readers-loading'],
      ['couldn’t check every link', { readersIncomplete: true }, 'cluster-fence-readers-incomplete'],
    ])('embedded, when Cloud is %s, doesn’t say that none read from the cluster', (_label, overrides, testId) => {
      setTopology({ readers: [], ...overrides });
      mockStatus('unfenced');
      renderWithFileRoutes(<ClusterFenceSourcePanel />);

      expect(screen.getByTestId(testId)).toBeVisible();
      expect(screen.queryByText('No links read from this cluster')).not.toBeInTheDocument();
    });
  });

  describe('a link that opens a dialog', () => {
    // The /shadowlinks route loader lists the cluster's links whenever the router lands on the page.
    const routeLoaderTransport = createRouterTransport(({ rpc }) => {
      rpc(listShadowLinks, () => ({ shadowLinks: [] }));
    });
    const renderAt = (initialLocation: string) =>
      renderWithFileRoutes(<ClusterFenceSourcePanel />, { initialLocation, transport: routeLoaderTransport });

    test('opens the settings with the user already added, so Save is all that’s left', async () => {
      mockStatus('unfenced');
      renderAt('/shadowlinks?tab=source&action=exempt&principal=shadow-telemetry');

      expect(await screen.findByTestId('cluster-fence-exempt-principals-chip-shadow-telemetry')).toBeVisible();
      expect(screen.getByTestId('cluster-fence-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.getByTestId('save-cluster-fence-settings')).toBeEnabled();
    });

    test.each([
      ['fence', 'unfenced', 'fence-cluster-dialog'],
      ['unfence', 'fenced', 'unfence-cluster-dialog'],
    ] as const)('%s on a cluster that’s %s opens its dialog', async (action, phase, testId) => {
      mockStatus(phase);
      renderAt(`/shadowlinks?tab=source&action=${action}`);

      expect(await screen.findByTestId(testId)).toBeVisible();
    });

    test('unfence on a cluster that’s already unfenced does nothing', async () => {
      mockStatus('unfenced');
      renderAt('/shadowlinks?tab=source&action=unfence');

      expect(await screen.findByTestId('cluster-fence-source-panel')).toBeVisible();
      expect(screen.queryByTestId('unfence-cluster-dialog')).not.toBeInTheDocument();
    });

    test.each([
      ['exempt', 'unfenced', 'cluster-fence-settings-dialog'],
      ['unfence', 'fenced', 'unfence-cluster-dialog'],
    ] as const)(
      'clears %s from the URL once its dialog closes, so it doesn’t open again',
      async (action, phase, testId) => {
        const user = userEvent.setup();
        mockStatus(phase);
        const { router } = renderAt(`/shadowlinks?tab=source&action=${action}&principal=shadow-telemetry`);

        await user.click(await screen.findByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(router.state.location.search).toEqual({ tab: 'source' }));
        expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
    );

    test('ignores any other action', async () => {
      mockStatus('unfenced');
      renderAt('/shadowlinks?tab=source&action=archive&principal=shadow-telemetry');

      expect(await screen.findByTestId('cluster-fence-source-panel')).toBeVisible();
      expect(screen.queryByTestId('cluster-fence-settings-dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('fence-cluster-dialog')).not.toBeInTheDocument();
    });
  });
});
