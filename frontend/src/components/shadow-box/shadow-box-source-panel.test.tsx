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
import { useShadowBoxStore } from 'stores/shadow-box-store';
import { renderWithFileRoutes } from 'test-utils';

rs.mock('react-query/api/shadow-box', () => {
  const actual = rs.requireActual<typeof import('react-query/api/shadow-box')>('react-query/api/shadow-box');
  const mutation = { mutate: rs.fn(), reset: rs.fn(), isPending: false, error: null };
  return {
    ...actual,
    useShadowBoxStatusQuery: rs.fn(),
    useBoxClusterMutation: rs.fn(() => mutation),
    useUnboxClusterMutation: rs.fn(() => mutation),
    useUpdateShadowBoxSettingsMutation: rs.fn(() => mutation),
  };
});
rs.mock('react-query/api/shadowlink', () => ({
  useListShadowLinksQuery: rs.fn(() => ({ data: { shadowLinks: [] } })),
}));

import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';

import { type BoxPhase, type BrokerProgress, isBlockingPhase } from './shadow-box-model';
import { ShadowBoxSourcePanel } from './shadow-box-source-panel';

const mockStatus = (
  phase: BoxPhase,
  brokers: BrokerProgress[] = [],
  exemptPrincipals = ['shadow-orders'],
  error: unknown = null
) =>
  rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
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
  } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);

const confirmed = (nodeId: number, phase: BoxPhase = 'boxed'): BrokerProgress => ({
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
  useShadowBoxStore.setState({
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

describe('the ShadowBoxSourcePanel', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(useListShadowLinksQuery).mockReturnValue({ data: { shadowLinks: [] } } as unknown as ReturnType<
      typeof useListShadowLinksQuery
    >);
    useShadowBoxStore.setState({ topology: null, openCluster: null });
  });

  describe('its fence', () => {
    test('an unfenced cluster offers Fence and shows its state', () => {
      mockStatus('unboxed', [confirmed(1, 'unboxed')]);
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('shadow-box-state-badge')).toHaveTextContent('Unfenced');
      expect(screen.getByTestId('open-box-cluster')).toBeVisible();
      expect(screen.queryByTestId('open-unbox-cluster')).not.toBeInTheDocument();
      expect(screen.getByTestId('shadow-box-headline')).toHaveTextContent('Clients write and read as usual.');
    });

    test('fencing: each broker’s copy and status, and a broker that isn’t answering holds it with no timeout', () => {
      mockStatus('boxing', [
        confirmed(1, 'boxing'),
        { nodeId: 2, status: 'behind', copy: { phase: 'unboxed', revision: -1n }, blocks: false },
        {
          nodeId: 3,
          status: 'not-answering',
          blocks: undefined,
          errorMessage: 'rpc::errc::disconnected_endpoint(node down)',
        },
      ]);
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('open-unbox-cluster')).toBeVisible();
      expect(screen.getByTestId('shadow-box-broker-1')).toHaveTextContent('Confirmed');
      expect(screen.getByTestId('shadow-box-broker-2')).toHaveTextContent('Unfenced · revision -1');
      expect(screen.getByTestId('shadow-box-broker-2')).toHaveTextContent('Behind');
      expect(screen.getByTestId('shadow-box-broker-3')).toHaveTextContent('disconnected_endpoint');
      expect(screen.getByTestId('shadow-box-headline')).toHaveTextContent(
        'Broker 3 isn’t answering, so the cluster stays fencing until it comes back or leaves the cluster. There’s no timeout.'
      );
      expect(screen.getByTestId('shadow-box-effect-produce')).toHaveAttribute('data-verdict', 'partly');
    });

    test('fenced: what clients see, row by row, with the errors they get', () => {
      mockStatus('boxed', [confirmed(1), confirmed(2)]);
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('shadow-box-effect-produce')).toHaveTextContent('REQUEST_TIMED_OUT (7)');
      expect(screen.getByTestId('shadow-box-effect-consume')).toHaveTextContent('POLICY_VIOLATION (44)');
      expect(screen.getByTestId('shadow-box-effect-schema')).toHaveTextContent('HTTP 412');
      expect(screen.getByTestId('shadow-box-effect-transaction')).toHaveTextContent('Ended by the fence');
      expect(screen.getByTestId('shadow-box-read-policy')).toHaveTextContent('shadow-orders');
    });

    test('with no one exempt, says once, loudly, that the fence locks out every shadow link', () => {
      mockStatus('unboxed', [], []);
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('shadow-box-read-policy')).toHaveTextContent('No one');
      expect(screen.getByTestId('shadow-box-policy-empty')).toHaveTextContent('every shadow link’s user');
    });

    test('a cluster with a shadow link that hasn’t failed over can’t be fenced; one that has failed over can', () => {
      rs.mocked(useListShadowLinksQuery).mockReturnValue({
        data: { shadowLinks: [{ name: 'inbound-dr', state: ShadowLinkState.ACTIVE }] },
      } as unknown as ReturnType<typeof useListShadowLinksQuery>);
      mockStatus('unboxed');
      const { unmount } = renderWithFileRoutes(<ShadowBoxSourcePanel />);
      expect(screen.getByTestId('open-box-cluster')).toBeDisabled();
      expect(
        screen.getByText('hasn’t failed over, so it’s still a shadow cluster', { exact: false })
      ).toBeInTheDocument();
      unmount();

      rs.mocked(useListShadowLinksQuery).mockReturnValue({
        data: { shadowLinks: [{ name: 'inbound-dr', state: ShadowLinkState.FAILED_OVER }] },
      } as unknown as ReturnType<typeof useListShadowLinksQuery>);
      renderWithFileRoutes(<ShadowBoxSourcePanel />);
      expect(screen.getByTestId('open-box-cluster')).toBeEnabled();
    });

    test('a failed refresh keeps the last status on screen, with a note', () => {
      mockStatus('boxed', [], ['shadow-orders'], new ConnectError('no controller leader', Code.Unavailable));
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('shadow-box-status-stale')).toHaveTextContent('no controller leader right now');
      expect(screen.getByTestId('shadow-box-status-card')).toBeVisible();
      expect(screen.queryByTestId('shadow-box-status-error')).not.toBeInTheDocument();
    });

    test('when the status can’t load, shows each broker’s own copy and offers a retry', async () => {
      const user = userEvent.setup();
      const refetch = rs.fn();
      rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
        isLoading: false,
        error: new ConnectError('no controller leader', Code.Unavailable),
        refetch,
        isRefetching: false,
        known: false,
        access: 'ok',
        unreadable: false,
        ownCopies: [{ nodeId: 1, phase: 'boxed', revision: 18n }],
        summary: { phase: 'unboxed' },
        brokers: [],
      } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('shadow-box-status-error')).toHaveTextContent('no controller leader right now');
      expect(screen.getByTestId('shadow-box-own-copies')).toHaveTextContent('Broker 1: Fenced, revision 18');
      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(refetch).toHaveBeenCalled();
    });

    test('a viewer without permission is told why the fence can’t be shown', () => {
      rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
        isLoading: false,
        error: new ConnectError('denied', Code.PermissionDenied),
        known: false,
        access: 'forbidden',
        summary: { phase: 'unboxed' },
        brokers: [],
        ownCopies: [],
      } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('shadow-box-forbidden')).toHaveTextContent(
        'You don’t have permission to view this cluster’s fence'
      );
    });
  });

  describe('the links that read from the cluster', () => {
    test('without the host, says Console can’t list the links that read from the cluster', () => {
      mockStatus('unboxed');
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('shadow-box-readers')).toHaveTextContent('Console can’t list them');
    });

    test('embedded, lists Cloud’s readers and whether the settings let each read', () => {
      setTopology();
      mockStatus('boxed');
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      expect(screen.getByTestId('shadow-box-reader-orders-dr')).toHaveTextContent('Can read');
      expect(screen.getByTestId('shadow-box-reader-telemetry-dr')).toHaveTextContent('Blocked');
      expect(screen.getByTestId('shadow-box-reader-edge-dr')).toHaveTextContent('mTLS certificate');
      expect(screen.getByTestId('shadow-box-reader-edge-dr')).toHaveTextContent('Can’t check');
      expect(screen.getByTestId('shadow-box-effect-link-telemetry-dr')).toHaveAttribute('data-verdict', 'rejected');
    });

    test('embedded, a reader’s name opens its Failover tab on the shadow cluster', async () => {
      const user = userEvent.setup();
      const openCluster = rs.fn();
      setTopology({}, openCluster);
      mockStatus('boxed');
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

      await user.click(screen.getByRole('button', { name: 'orders-dr' }));
      expect(openCluster).toHaveBeenCalledWith('dr', '/shadowlinks/orders-dr?tab=failover');
    });

    test.each([
      ['still finding links', { resolving: true }, 'shadow-box-readers-loading'],
      ['couldn’t check every link', { readersIncomplete: true }, 'shadow-box-readers-incomplete'],
    ])('embedded, when Cloud is %s, doesn’t say that none read from the cluster', (_label, overrides, testId) => {
      setTopology({ readers: [], ...overrides });
      mockStatus('unboxed');
      renderWithFileRoutes(<ShadowBoxSourcePanel />);

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
      renderWithFileRoutes(<ShadowBoxSourcePanel />, { initialLocation, transport: routeLoaderTransport });

    test('opens the settings with the user already added, so Save is all that’s left', async () => {
      mockStatus('unboxed');
      renderAt('/shadowlinks?tab=source&action=exempt&principal=shadow-telemetry');

      expect(await screen.findByTestId('shadow-box-exempt-principals-chip-shadow-telemetry')).toBeVisible();
      expect(screen.getByTestId('shadow-box-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.getByTestId('save-shadow-box-settings')).toBeEnabled();
    });

    test.each([
      ['fence', 'unboxed', 'box-cluster-dialog'],
      ['unfence', 'boxed', 'unbox-cluster-dialog'],
    ] as const)('%s on a cluster that’s %s opens its dialog', async (action, phase, testId) => {
      mockStatus(phase);
      renderAt(`/shadowlinks?tab=source&action=${action}`);

      expect(await screen.findByTestId(testId)).toBeVisible();
    });

    test('unfence on a cluster that’s already unfenced does nothing', async () => {
      mockStatus('unboxed');
      renderAt('/shadowlinks?tab=source&action=unfence');

      expect(await screen.findByTestId('shadow-box-source-panel')).toBeVisible();
      expect(screen.queryByTestId('unbox-cluster-dialog')).not.toBeInTheDocument();
    });

    test.each([
      ['exempt', 'unboxed', 'shadow-box-settings-dialog'],
      ['unfence', 'boxed', 'unbox-cluster-dialog'],
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
      mockStatus('unboxed');
      renderAt('/shadowlinks?tab=source&action=box&principal=shadow-telemetry');

      expect(await screen.findByTestId('shadow-box-source-panel')).toBeVisible();
      expect(screen.queryByTestId('shadow-box-settings-dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('box-cluster-dialog')).not.toBeInTheDocument();
    });
  });
});
