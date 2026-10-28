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
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useSyncExternalStore } from 'react';
import { useShadowBoxStore } from 'stores/shadow-box-store';
import { renderWithFileRoutes } from 'test-utils';

const mutate = rs.fn();
const mutation = { mutate, reset: rs.fn(), isPending: false, error: null as unknown, savedBox: undefined as unknown };

rs.mock('react-query/api/shadow-box', () => {
  const actual = rs.requireActual<typeof import('react-query/api/shadow-box')>('react-query/api/shadow-box');
  return {
    ...actual,
    useShadowBoxStatusQuery: rs.fn(),
    useBoxClusterMutation: rs.fn(() => mutation),
  };
});
rs.mock('react-query/api/shadowlink', () => ({ useListShadowLinksQuery: rs.fn() }));
rs.mock('sonner', () => ({ toast: { success: rs.fn(), error: rs.fn() } }));

import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useListShadowLinksQuery } from 'react-query/api/shadowlink';

import { BoxClusterDialog } from './box-cluster-dialog';

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
  phase: 'unboxed',
  revision: BigInt(revision),
  exemptPrincipals: [],
  allowAllReads: false,
  skipTransactionExpiration: false,
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
  return <BoxClusterDialog onOpenChange={(next) => live.set({ open: next })} open={open} />;
};

const renderDialog = () => renderWithFileRoutes(<Harness />);

/** Renders the dialog and types the cluster name, as a user about to box would. */
const renderConfirmed = async () => {
  const user = userEvent.setup();
  renderDialog();
  await user.type(await screen.findByTestId('box-cluster-confirmation'), 'prod-us-east-1');
  return user;
};

describe('the BoxClusterDialog', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mutation.error = null;
    mutation.savedBox = undefined;
    live.open = true;
    live.value = {
      summary: summaryAt(2),
      brokers: [
        { nodeId: 1, status: 'confirmed' },
        { nodeId: 2, status: 'confirmed' },
      ],
    };
    rs.mocked(useShadowBoxStatusQuery).mockImplementation(
      () => useSyncExternalStore(subscribe, () => live.value) as unknown as ReturnType<typeof useShadowBoxStatusQuery>
    );
    mockOwnLinks([]);
    useShadowBoxStore.setState({
      topology: {
        clusterName: 'prod-us-east-1',
        readers: [
          {
            linkName: 'orders-dr',
            shadowClusterId: 'dr',
            shadowClusterName: 'dr-us-west-2',
            principal: 'shadow-orders',
          },
        ],
        sources: {},
        resolving: false,
        readersIncomplete: false,
      },
    });
  });

  describe('its settings', () => {
    test('prefills the principals of the links that read from the cluster', async () => {
      renderDialog();

      expect(await screen.findByTestId('shadow-box-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.getByTestId('box-preflight-readers')).toHaveAttribute('data-status', 'pass');
    });

    test('a User: name gets a one-click fix to the bare name', async () => {
      const user = userEvent.setup();
      live.value = { summary: summaryAt(2, { exemptPrincipals: ['User:shadow-orders'] }), brokers: [] };
      renderDialog();

      await user.click(await screen.findByRole('button', { name: 'Use shadow-orders' }));
      expect(screen.getByTestId('shadow-box-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.queryByTestId('shadow-box-exempt-principals-chip-User:shadow-orders')).not.toBeInTheDocument();
    });

    test('with no one exempt, Box waits for an explicit acknowledgement that it locks out every link', async () => {
      useShadowBoxStore.setState({
        topology: {
          clusterName: 'prod-us-east-1',
          readers: [],
          sources: {},
          resolving: false,
          readersIncomplete: false,
        },
      });
      const user = await renderConfirmed();

      expect(screen.getByTestId('shadow-box-settings-warning-empty')).toHaveTextContent('every shadow link’s user');
      expect(screen.getByTestId('confirm-box-cluster')).toBeDisabled();

      await user.click(screen.getByTestId('box-cluster-lock-out'));
      expect(screen.getByTestId('confirm-box-cluster')).toBeEnabled();
    });
  });

  describe('its preflight checks', () => {
    test('a shadow link that has failed over doesn’t stop Box', async () => {
      rs.mocked(useListShadowLinksQuery).mockReturnValue({
        data: { shadowLinks: [{ name: 'inbound-dr', state: ShadowLinkState.FAILED_OVER }] },
      } as unknown as ReturnType<typeof useListShadowLinksQuery>);
      renderDialog();

      expect(await screen.findByTestId('box-preflight-own-links')).toHaveAttribute('data-status', 'pass');
    });

    test('doesn’t pass the own-links check before the links load, or the readers check before the host finishes', async () => {
      const user = userEvent.setup();
      mockOwnLinks('loading');
      useShadowBoxStore.setState({
        topology: {
          clusterName: 'prod-us-east-1',
          readers: [],
          sources: {},
          resolving: true,
          readersIncomplete: false,
        },
      });
      renderDialog();

      expect(await screen.findByTestId('box-preflight-own-links')).toHaveAttribute('data-status', 'pending');
      expect(screen.getByTestId('box-preflight-readers')).toHaveAttribute('data-status', 'pending');
      await user.type(screen.getByTestId('box-cluster-confirmation'), 'prod-us-east-1');
      expect(screen.getByTestId('confirm-box-cluster')).toBeDisabled();
    });

    test('a cluster with shadow links of its own can’t be boxed', async () => {
      const user = userEvent.setup();
      mockOwnLinks(['inbound-dr']);
      renderDialog();

      expect(await screen.findByTestId('box-preflight-own-links')).toHaveAttribute('data-status', 'fail');
      await user.type(screen.getByTestId('box-cluster-confirmation'), 'prod-us-east-1');
      expect(screen.getByTestId('confirm-box-cluster')).toBeDisabled();
    });

    test('warns when a reader would be fenced out', async () => {
      const user = userEvent.setup();
      renderDialog();

      await user.click(await screen.findByLabelText('Remove tag'));
      expect(screen.getByTestId('box-preflight-reader-orders-dr')).toHaveAttribute('data-status', 'warn');
      expect(screen.queryByTestId('box-preflight-policy-empty')).not.toBeInTheDocument();
    });
  });

  describe('boxing', () => {
    test('boxes only after the cluster name is typed, with the reviewed settings and revision', async () => {
      const user = userEvent.setup();
      renderDialog();

      const confirm = await screen.findByTestId('confirm-box-cluster');
      expect(confirm).toBeDisabled();

      await user.type(screen.getByTestId('box-cluster-confirmation'), 'prod-us-east-1');
      expect(confirm).toBeEnabled();
      await user.click(confirm);

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({
        settings: { exemptPrincipals: ['shadow-orders'], allowAllReads: false, skipTransactionExpiration: false },
        opened: { revision: 2n },
      });
    });

    test('keeps the revision it opened with when a poll brings a newer one, and says so', async () => {
      const user = await renderConfirmed();

      live.set({ value: { summary: summaryAt(5, { allowAllReads: true }), brokers: [] } });

      expect(await screen.findByTestId('shadow-box-changed')).toBeVisible();
      expect(screen.getByTestId('confirm-box-cluster')).toBeDisabled();

      await user.click(screen.getByTestId('shadow-box-changed-refresh'));
      expect(screen.queryByTestId('shadow-box-changed')).not.toBeInTheDocument();
      expect(screen.getByTestId('shadow-box-allow-all-reads')).toBeChecked();
      await user.click(screen.getByTestId('confirm-box-cluster'));
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ opened: { revision: 5n } });
    });

    test('says so when someone else boxed the cluster while it was open', async () => {
      const user = userEvent.setup();
      renderDialog();
      await screen.findByTestId('confirm-box-cluster');

      live.set({ value: { summary: summaryAt(3, { phase: 'boxing' }), brokers: [] } });
      await user.click(await screen.findByTestId('shadow-box-changed-refresh'));

      expect(screen.getByTestId('box-cluster-already-boxed')).toHaveTextContent('already boxing');
      expect(screen.getByTestId('confirm-box-cluster')).toBeDisabled();
    });

    test('when its own save went through but Box failed, doesn’t blame someone else and lets the user retry', async () => {
      const user = await renderConfirmed();

      const saved = summaryAt(3, { exemptPrincipals: ['shadow-orders'] });
      mutation.error = new ConnectError('a data migration is still running', Code.FailedPrecondition);
      mutation.savedBox = saved;
      live.set({ value: { summary: saved, brokers: [] } });

      expect(await screen.findByTestId('box-cluster-error')).toHaveTextContent(
        'Settings saved, but the cluster isn’t boxed'
      );
      expect(screen.queryByTestId('shadow-box-changed')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('confirm-box-cluster'));
      expect(mutate.mock.calls[0]?.[0]).toMatchObject({ opened: { revision: 3n } });
    });

    test('starts over after Cancel', async () => {
      const user = await renderConfirmed();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByTestId('box-cluster-dialog')).not.toBeInTheDocument());

      live.set({ open: true });

      expect(await screen.findByTestId('box-cluster-confirmation')).toHaveValue('');
      expect(screen.getByTestId('confirm-box-cluster')).toBeDisabled();
    });

    test('explains a failed Box in plain words', async () => {
      mutation.error = new ConnectError(
        'Shadow boxing cannot start while a shadow link is configured',
        Code.FailedPrecondition
      );
      renderDialog();

      expect(await screen.findByTestId('box-cluster-error')).toHaveTextContent(
        'Box its source instead, or fail the link over first.'
      );
    });
  });
});
