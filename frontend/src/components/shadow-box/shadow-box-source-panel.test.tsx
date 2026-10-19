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

import { Code, ConnectError } from '@connectrpc/connect';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import type { BoxPhase, BrokerProgress } from './shadow-box-model';
import { ShadowBoxSourcePanel } from './shadow-box-source-panel';

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
    summary: {
      phase,
      revision: BigInt(3),
      stateChangedAt: new Date(Date.now() - 12 * 60 * 1000),
      exemptPrincipals,
      allowAllReads: false,
      skipTransactionExpiration: false,
    },
    brokers,
  } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);

describe('ShadowBoxSourcePanel', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    rs.mocked(useListShadowLinksQuery).mockReturnValue({ data: { shadowLinks: [] } } as unknown as ReturnType<
      typeof useListShadowLinksQuery
    >);
    useShadowBoxStore.setState({ topology: null, openCluster: null });
  });

  test('an unboxed cluster offers Box and explains when to use it', () => {
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-state-badge')).toHaveTextContent('Unboxed');
    expect(screen.getByTestId('open-box-cluster')).toBeVisible();
    expect(screen.queryByTestId('open-unbox-cluster')).not.toBeInTheDocument();
    expect(screen.getByTestId('shadow-box-status-card')).toHaveTextContent('Box it just before you fail over');
  });

  test('a boxing cluster shows each broker’s progress and why it may be stuck', () => {
    mockStatus('boxing', [
      { nodeId: 0, status: 'applied' },
      { nodeId: 1, status: 'pending' },
      { nodeId: 2, status: 'unreachable', errorMessage: 'Broker 2 did not answer' },
    ]);
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('open-unbox-cluster')).toBeVisible();
    expect(screen.getByTestId('shadow-box-broker-0')).toHaveTextContent('Applied');
    expect(screen.getByTestId('shadow-box-broker-1')).toHaveTextContent('Waiting');
    expect(screen.getByTestId('shadow-box-broker-2')).toHaveTextContent('Broker 2 did not answer');
    expect(screen.getByTestId('shadow-box-status-card')).toHaveTextContent(
      'Broker 2 isn’t responding, so this can’t finish until it’s back.'
    );
  });

  test('a settled box hides the broker table', () => {
    mockStatus('boxed', [{ nodeId: 0, status: 'applied' }]);
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.queryByTestId('shadow-box-broker-progress')).not.toBeInTheDocument();
    expect(screen.getByTestId('shadow-box-read-policy')).toHaveTextContent('shadow-orders');
  });

  test('warns when nobody is exempt', () => {
    mockStatus('unboxed', [], []);
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-read-policy')).toHaveTextContent('No one is exempt');
  });

  test('without the host, says Console can’t list the links that read from the cluster', () => {
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-readers')).toHaveTextContent('Console can’t list them');
  });

  test('embedded, lists Cloud’s readers, flags the ones that can’t read, and opens their cutover', async () => {
    const user = userEvent.setup();
    const openCluster = rs.fn();
    useShadowBoxStore.setState({
      openCluster,
      topology: {
        clusterName: 'prod-us-east-1',
        readers: [
          {
            linkName: 'orders-dr',
            shadowClusterId: 'dr',
            shadowClusterName: 'dr-us-west-2',
            principal: 'shadow-orders',
          },
          {
            linkName: 'telemetry-dr',
            shadowClusterId: 'eu',
            shadowClusterName: 'telemetry-eu-dr',
            principal: 'shadow-telemetry',
          },
        ],
        sources: {},
        resolving: false,
        readersIncomplete: false,
      },
    });
    mockStatus('boxed');
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-reader-orders-dr')).toHaveTextContent('Exempt');
    expect(screen.getByTestId('shadow-box-reader-telemetry-dr')).toHaveTextContent('Not exempt');

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

  test('a shadow cluster can’t be boxed, and Box says why before anyone clicks it', () => {
    rs.mocked(useListShadowLinksQuery).mockReturnValue({
      data: { shadowLinks: [{ name: 'inbound-dr' }] },
    } as unknown as ReturnType<typeof useListShadowLinksQuery>);
    mockStatus('unboxed');
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('open-box-cluster')).toBeDisabled();
    expect(screen.getByText('This cluster has a shadow link of its own', { exact: false })).toBeInTheDocument();
  });

  test('a failed refresh keeps the last status on screen, with a note', () => {
    mockStatus('boxed', [], ['shadow-orders'], new ConnectError('the controller isn’t available', Code.Unavailable));
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-status-stale')).toHaveTextContent('The cluster isn’t available right now');
    expect(screen.getByTestId('shadow-box-status-card')).toBeVisible();
    expect(screen.queryByTestId('shadow-box-status-error')).not.toBeInTheDocument();
  });

  test('shows a retryable error when the status can’t load', async () => {
    const user = userEvent.setup();
    const refetch = rs.fn();
    rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
      isLoading: false,
      error: new ConnectError('the controller isn’t available', Code.Unavailable),
      refetch,
      isRefetching: false,
      known: false,
      summary: { phase: 'unboxed' },
    } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);
    renderWithFileRoutes(<ShadowBoxSourcePanel />);

    expect(screen.getByTestId('shadow-box-status-error')).toHaveTextContent('The cluster isn’t available right now');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  test('arriving with action=box opens Box, and keeps the action in the URL until the dialog closes', async () => {
    const user = userEvent.setup();
    mockStatus('unboxed');
    const { router } = renderWithFileRoutes(<ShadowBoxSourcePanel />, {
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
      initialLocation: '/shadowlinks?tab=source&action=unbox',
    });

    await waitFor(() => expect(router.state.location.search).not.toHaveProperty('action'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('arriving with action=exempt opens the settings with that user added, ready to save', async () => {
    mockStatus('boxed', [], []);
    renderWithFileRoutes(<ShadowBoxSourcePanel />, {
      initialLocation: '/shadowlinks?tab=source&action=exempt&principal=shadow-orders',
    });

    const dialog = await screen.findByTestId('shadow-box-settings-dialog');
    expect(dialog).toHaveTextContent('shadow-orders');
    expect(screen.getByTestId('save-shadow-box-settings')).toBeEnabled();
  });

  test('with no one exempt, says a box would block every consumer, and that it does once boxed', () => {
    mockStatus('unboxed', [], []);
    const { unmount } = renderWithFileRoutes(<ShadowBoxSourcePanel />);
    expect(screen.getByTestId('shadow-box-read-policy')).toHaveTextContent('a box would block every consumer');
    unmount();

    mockStatus('boxed', [], []);
    renderWithFileRoutes(<ShadowBoxSourcePanel />);
    expect(screen.getByTestId('shadow-box-read-policy')).toHaveTextContent('so every consumer is blocked');
  });
});
