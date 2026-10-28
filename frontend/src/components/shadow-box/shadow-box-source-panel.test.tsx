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

import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';

import { type BoxPhase, type BrokerProgress, isBlockingPhase } from './shadow-box-model';
import { ShadowBoxSourcePanel } from './shadow-box-source-panel';

// The /shadowlinks route loader lists the cluster's links whenever the router lands on the page.
const routeLoaderTransport = createRouterTransport(({ rpc }) => {
  rpc(listShadowLinks, () => ({ shadowLinks: [] }));
});

const BOX_DIALOG_NAME = /Box this cluster/;

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
    noLeader: false,
    ownCopies: [],
    blocking: isBlockingPhase(phase),
    summary: {
      phase,
      revision: 18n,
      stateChangedAt: new Date(Date.now() - 12 * 60 * 1000),
      exemptPrincipals,
      allowAllReads: false,
      skipTransactionExpiration: false,
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

describe('the ShadowBoxSourcePanel', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(useListShadowLinksQuery).mockReturnValue({ data: { shadowLinks: [] } } as unknown as ReturnType<
      typeof useListShadowLinksQuery
    >);
    useShadowBoxStore.setState({ topology: null, openCluster: null });
  });

  test('an unboxed cluster offers Box, marks its state among the four, and lists the source’s three steps', () => {
    mockStatus('unboxed', [confirmed(1, 'unboxed')]);
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-state-badge')).toHaveTextContent('Unboxed');
    expect(screen.getByTestId('open-box-cluster')).toBeVisible();
    expect(screen.queryByTestId('open-unbox-cluster')).not.toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Unboxed');
    expect(screen.getByTestId('shadow-box-headline')).toHaveTextContent('Clients write and read as usual.');
    expect(screen.getByTestId('shadow-box-step-settings')).toBeVisible();
    expect(screen.getByTestId('shadow-box-step-settings')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('shadow-box-step-box')).toHaveAttribute('data-state', 'current');
  });

  test('boxing: each broker’s copy and status, and a broker that isn’t answering holds it with no timeout', () => {
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
    expect(screen.getByTestId('shadow-box-broker-2')).toHaveTextContent('Unboxed · revision -1');
    expect(screen.getByTestId('shadow-box-broker-2')).toHaveTextContent('Behind');
    expect(screen.getByTestId('shadow-box-broker-3')).toHaveTextContent('disconnected_endpoint');
    expect(screen.getByTestId('shadow-box-headline')).toHaveTextContent(
      'Broker 3 isn’t answering, so the cluster stays boxing until it comes back or leaves the cluster. There’s no timeout.'
    );
    expect(screen.getByTestId('shadow-box-effect-produce')).toHaveAttribute('data-verdict', 'partly');
  });

  test('boxed: what clients see, row by row, with the errors they get', () => {
    mockStatus('boxed', [confirmed(1), confirmed(2)]);
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-effect-produce')).toHaveTextContent('REQUEST_TIMED_OUT (7)');
    expect(screen.getByTestId('shadow-box-effect-consume')).toHaveTextContent('POLICY_VIOLATION (44)');
    expect(screen.getByTestId('shadow-box-effect-schema')).toHaveTextContent('HTTP 412');
    expect(screen.getByTestId('shadow-box-effect-transaction')).toHaveTextContent('Ended by the box');
    expect(screen.getByTestId('shadow-box-step-wait')).toHaveAttribute('data-state', 'done');
    expect(screen.getByTestId('shadow-box-read-policy')).toHaveTextContent('shadow-orders');
  });

  test('with no one exempt, says loudly that the box locks out every shadow link', () => {
    mockStatus('unboxed', [], []);
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-read-policy')).toHaveTextContent('No one');
    expect(screen.getByTestId('shadow-box-policy-empty')).toHaveTextContent('every shadow link’s user');
    expect(screen.getByTestId('shadow-box-step-settings')).toHaveTextContent('By default a box blocks every consumer');
  });

  test('without the host, says Console can’t list the links that read from the cluster', () => {
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-readers')).toHaveTextContent('Console can’t list them');
  });

  test('embedded, lists Cloud’s readers, whether the settings let each read, and opens their cutover', async () => {
    const user = userEvent.setup();
    const openCluster = rs.fn();
    useShadowBoxStore.setState({
      openCluster,
      topology: { clusterName: 'prod-us-east-1', readers, sources: {}, resolving: false, readersIncomplete: false },
    });
    mockStatus('boxed');
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-reader-orders-dr')).toHaveTextContent('Can read');
    expect(screen.getByTestId('shadow-box-reader-telemetry-dr')).toHaveTextContent('Blocked');
    expect(screen.getByTestId('shadow-box-reader-edge-dr')).toHaveTextContent('mTLS certificate');
    expect(screen.getByTestId('shadow-box-reader-edge-dr')).toHaveTextContent('Can’t check');
    expect(screen.getByTestId('shadow-box-effect-link-telemetry-dr')).toHaveAttribute('data-verdict', 'rejected');
    expect(screen.getByTestId('shadow-box-step-settings')).toHaveAttribute('data-state', 'attention');

    await user.click(screen.getByRole('button', { name: 'orders-dr' }));
    expect(openCluster).toHaveBeenCalledWith('dr', '/shadowlinks/orders-dr?tab=cutover');
  });

  test('embedded, while Cloud is still finding links, doesn’t say that none read from the cluster', () => {
    useShadowBoxStore.setState({
      topology: { clusterName: 'prod-us-east-1', readers: [], sources: {}, resolving: true, readersIncomplete: false },
    });
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-readers-loading')).toBeVisible();
    expect(screen.queryByText('No links read from this cluster')).not.toBeInTheDocument();
  });

  test('embedded, when Cloud couldn’t check every link, says the list may be missing some', () => {
    useShadowBoxStore.setState({
      topology: { clusterName: 'prod-us-east-1', readers: [], sources: {}, resolving: false, readersIncomplete: true },
    });
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-readers-incomplete')).toHaveTextContent('may be missing some');
    expect(screen.queryByText('No links read from this cluster')).not.toBeInTheDocument();
  });

  test('a cluster with a shadow link that hasn’t failed over can’t be boxed; one that has failed over can', () => {
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
    expect(screen.getByTestId('shadow-box-own-copies')).toHaveTextContent('Broker 1: Boxed, revision 18');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  test('a viewer who isn’t a superuser is told why the box can’t be shown', () => {
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

    expect(screen.getByTestId('shadow-box-forbidden')).toHaveTextContent('Only superusers');
  });

  test('arriving with action=box opens Box, and keeps the action in the URL until the dialog closes', async () => {
    const user = userEvent.setup();
    mockStatus('unboxed');
    const { router } = renderWithFileRoutes(<ShadowBoxSourcePanel />, {
      transport: routeLoaderTransport,
      initialLocation: '/shadowlinks?tab=source&action=box',
    });

    expect(await screen.findByRole('dialog', { name: BOX_DIALOG_NAME })).toBeVisible();
    expect(router.state.location.search).toMatchObject({ action: 'box' });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('action'));
    expect(router.state.location.search).toMatchObject({ tab: 'source' });
  });

  test('an action the box’s state doesn’t allow opens nothing and leaves the URL', async () => {
    mockStatus('unboxed');
    const { router } = renderWithFileRoutes(<ShadowBoxSourcePanel />, {
      transport: routeLoaderTransport,
      initialLocation: '/shadowlinks?tab=source&action=unbox',
    });

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('action'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('arriving with action=exempt opens the settings with that user added, ready to save', async () => {
    mockStatus('boxed', [], []);
    renderWithFileRoutes(<ShadowBoxSourcePanel />, {
      transport: routeLoaderTransport,
      initialLocation: '/shadowlinks?tab=source&action=exempt&principal=shadow-orders',
    });

    const dialog = await screen.findByTestId('shadow-box-settings-dialog');
    expect(dialog).toHaveTextContent('shadow-orders');
    expect(screen.getByTestId('save-shadow-box-settings')).toBeEnabled();
  });
});
