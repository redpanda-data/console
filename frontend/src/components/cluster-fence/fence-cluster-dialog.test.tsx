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
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShadowLinkReader } from 'federation/types';
import { useSyncExternalStore } from 'react';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { renderWithFileRoutes } from 'test-utils';

const mutate = rs.fn();
const mutation = { mutate, reset: rs.fn(), isPending: false, error: null as unknown, savedFence: undefined as unknown };

rs.mock('react-query/api/cluster-fence', () => {
  const actual = rs.requireActual<typeof import('react-query/api/cluster-fence')>('react-query/api/cluster-fence');
  return {
    ...actual,
    useClusterFenceStatusQuery: rs.fn(),
    useFenceClusterMutation: rs.fn(() => mutation),
  };
});
rs.mock('react-query/api/shadowlink', () => ({ useListShadowLinksQuery: rs.fn() }));
rs.mock('sonner', () => ({ toast: { success: rs.fn(), error: rs.fn() } }));

import { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';

import { FenceClusterDialog } from './fence-cluster-dialog';

const mockOwnLinks = (names: string[] | 'loading') =>
  rs
    .mocked(useListShadowLinksQuery)
    .mockReturnValue(
      (names === 'loading'
        ? { data: undefined, isError: false }
        : { data: { shadowLinks: names.map((name) => ({ name })) } }) as unknown as ReturnType<
        typeof useListShadowLinksQuery
      >
    );

const summaryAt = (revision: number, overrides: Record<string, unknown> = {}) => ({
  phase: 'unfenced',
  revision: BigInt(revision),
  exemptPrincipals: [],
  allowAllReads: false,
  ...overrides,
});

/** Stands in for the polled status, so a test can change it while the dialog is open. */
const live = {
  value: { summary: summaryAt(2), brokers: [{ nodeId: 1, status: 'confirmed' }] } as unknown,
  open: true,
  listeners: new Set<() => void>(),
  set(next: Partial<{ value: unknown; open: boolean }>) {
    act(() => {
      Object.assign(live, next);
      for (const listener of live.listeners) {
        listener();
      }
    });
  },
};
const subscribe = (listener: () => void) => {
  live.listeners.add(listener);
  return () => live.listeners.delete(listener);
};

const Harness = () => {
  const open = useSyncExternalStore(subscribe, () => live.open);
  return <FenceClusterDialog onOpenChange={(next) => live.set({ open: next })} open={open} />;
};

const renderDialog = () => renderWithFileRoutes(<Harness />);

const setReaders = (readers: ShadowLinkReader[], resolving = false) =>
  useClusterFenceStore.setState({
    topology: { clusterName: 'prod-us-east-1', readers, sources: {}, resolving, readersIncomplete: false },
  });

/** Renders the dialog and types the cluster name, as a user about to fence would. */
const renderConfirmed = async () => {
  const user = userEvent.setup();
  renderDialog();
  await user.type(await screen.findByTestId('fence-cluster-confirmation'), 'prod-us-east-1');
  return user;
};

describe('the FenceClusterDialog', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mutation.error = null;
    mutation.savedFence = undefined;
    live.open = true;
    live.value = {
      summary: summaryAt(2),
      brokers: [
        { nodeId: 1, status: 'confirmed' },
        { nodeId: 2, status: 'confirmed' },
      ],
    };
    rs.mocked(useClusterFenceStatusQuery).mockImplementation(
      () =>
        useSyncExternalStore(subscribe, () => live.value) as unknown as ReturnType<typeof useClusterFenceStatusQuery>
    );
    mockOwnLinks([]);
    setReaders([
      { linkName: 'orders-dr', shadowClusterId: 'dr', shadowClusterName: 'dr-us-west-2', principal: 'shadow-orders' },
    ]);
  });

  describe('its settings', () => {
    test('prefills the principals of the links that read from the cluster', async () => {
      renderDialog();

      expect(await screen.findByTestId('cluster-fence-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.getByTestId('fence-preflight-readers')).toHaveAttribute('data-status', 'pass');
    });

    test('a User: name is flagged once, in the field, with a one-click fix to the bare name', async () => {
      const user = userEvent.setup();
      live.value = { summary: summaryAt(2, { exemptPrincipals: ['User:shadow-orders'] }), brokers: [] };
      renderDialog();

      expect(await screen.findAllByText('matches nobody', { exact: false })).toHaveLength(1);
      expect(screen.queryByTestId('fence-preflight-policy-prefix-User:shadow-orders')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Use shadow-orders' }));
      expect(screen.getByTestId('cluster-fence-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.queryByTestId('cluster-fence-exempt-principals-chip-User:shadow-orders')).not.toBeInTheDocument();
    });

    test('with no one exempt, warns in the field, and typing the name is still all it takes', async () => {
      setReaders([]);
      await renderConfirmed();

      expect(screen.getByTestId('cluster-fence-settings-warning-empty')).toHaveTextContent('every shadow link’s user');
      expect(screen.getByTestId('confirm-fence-cluster')).toBeEnabled();
    });
  });

  describe('its preflight checks', () => {
    test('doesn’t pass the own-links check before the links load, or the readers check before the host finishes', async () => {
      const user = userEvent.setup();
      mockOwnLinks('loading');
      setReaders([], true);
      renderDialog();

      expect(await screen.findByTestId('fence-preflight-own-links')).toHaveAttribute('data-status', 'pending');
      expect(screen.getByTestId('fence-preflight-readers')).toHaveAttribute('data-status', 'pending');
      await user.type(screen.getByTestId('fence-cluster-confirmation'), 'prod-us-east-1');
      expect(screen.getByTestId('confirm-fence-cluster')).toBeDisabled();
    });

    test('a cluster with shadow links of its own can’t be fenced', async () => {
      const user = userEvent.setup();
      mockOwnLinks(['inbound-dr']);
      renderDialog();

      expect(await screen.findByTestId('fence-preflight-own-links')).toHaveAttribute('data-status', 'fail');
      await user.type(screen.getByTestId('fence-cluster-confirmation'), 'prod-us-east-1');
      expect(screen.getByTestId('confirm-fence-cluster')).toBeDisabled();
    });

    test('warns when a reader would be fenced out', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(await screen.findByLabelText('Remove tag'));
      expect(screen.getByTestId('fence-preflight-reader-orders-dr')).toHaveAttribute('data-status', 'warn');
      expect(screen.queryByTestId('fence-preflight-policy-empty')).not.toBeInTheDocument();
    });
  });

  describe('fencing', () => {
    test('fences only after the cluster name is typed, with the reviewed settings and revision', async () => {
      const user = userEvent.setup();
      renderDialog();

      const confirm = await screen.findByTestId('confirm-fence-cluster');
      expect(confirm).toBeDisabled();

      await user.type(screen.getByTestId('fence-cluster-confirmation'), 'prod-us-east-1');
      expect(confirm).toBeEnabled();
      await user.click(confirm);

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        settings: { exemptPrincipals: ['shadow-orders'], allowAllReads: false },
        opened: { revision: 2n },
      });
    });

    test('keeps the revision it opened with when a poll brings a newer one, and says so', async () => {
      const user = await renderConfirmed();

      live.set({ value: { summary: summaryAt(5, { allowAllReads: true }), brokers: [] } });

      expect(await screen.findByTestId('cluster-fence-changed')).toBeVisible();
      expect(screen.getByTestId('confirm-fence-cluster')).toBeDisabled();

      await user.click(screen.getByTestId('cluster-fence-changed-refresh'));
      expect(screen.queryByTestId('cluster-fence-changed')).not.toBeInTheDocument();
      expect(screen.getByTestId('cluster-fence-allow-all-reads')).toBeChecked();
      await user.click(screen.getByTestId('confirm-fence-cluster'));
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ opened: { revision: 5n } });
    });

    test('says so when someone else fenced the cluster while it was open', async () => {
      const user = userEvent.setup();
      renderDialog();
      await screen.findByTestId('confirm-fence-cluster');

      live.set({ value: { summary: summaryAt(3, { phase: 'fencing' }), brokers: [] } });
      await user.click(await screen.findByTestId('cluster-fence-changed-refresh'));

      expect(screen.getByTestId('fence-cluster-already-fenced')).toHaveTextContent('already fencing');
      expect(screen.getByTestId('confirm-fence-cluster')).toBeDisabled();
    });

    test('when its own save went through but Fence failed, doesn’t blame someone else and lets the user retry', async () => {
      const user = await renderConfirmed();

      const saved = summaryAt(3, { exemptPrincipals: ['shadow-orders'] });
      mutation.error = new ConnectError('a data migration is still running', Code.FailedPrecondition);
      mutation.savedFence = saved;
      live.set({ value: { summary: saved, brokers: [] } });

      expect(await screen.findByTestId('fence-cluster-error')).toHaveTextContent(
        'Settings saved, but the cluster isn’t fenced'
      );
      expect(screen.queryByTestId('cluster-fence-changed')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('confirm-fence-cluster'));
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ opened: { revision: 3n } });
    });

    test('starts over after Cancel', async () => {
      const user = await renderConfirmed();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByTestId('fence-cluster-dialog')).not.toBeInTheDocument());

      live.set({ open: true });

      expect(await screen.findByTestId('fence-cluster-confirmation')).toHaveValue('');
      expect(screen.getByTestId('confirm-fence-cluster')).toBeDisabled();
    });
  });
});
