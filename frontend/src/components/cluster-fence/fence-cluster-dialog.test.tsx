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
import { beforeEach, describe, expect, onTestFinished, test } from '@rstest/core';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from 'components/redpanda-ui/components/button';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import {
  ClusterFenceState,
  type FenceRequest,
  type GetClusterFenceStatusResponse,
  GetClusterFenceStatusResponseSchema,
  type UpdateClusterFenceSettingsRequest,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import {
  fence,
  updateClusterFenceSettings,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useState } from 'react';
import { useClusterFenceStore } from 'stores/cluster-fence-store';

import {
  enableFenceFixtures,
  fenceStatus,
  readFenceStatus,
  renderWithFenceStatus,
  serveFenceStatus,
} from './cluster-fence.test-utils';
import { FenceClusterDialog } from './fence-cluster-dialog';
import type { ShadowLinkReader, ShadowLinkTopology } from './shadow-link-topology';

const CLUSTER = 'prod-us-east-1';
const CONFIRM = 'confirm-fence-cluster';
const CONFIRMATION = 'fence-cluster-confirmation';
const DIALOG = 'fence-cluster-dialog';
const CHANGED = 'cluster-fence-changed';
const REVIEW = 'cluster-fence-changed-refresh';
const READERS: ShadowLinkReader[] = [
  {
    linkName: 'orders-dr',
    shadowClusterId: 'dr',
    shadowClusterName: 'dr-us-west-2',
    authentication: 'sasl',
    principal: 'shadow-orders',
  },
];

function setReaders(readers: ShadowLinkReader[] = READERS, overrides: Partial<ShadowLinkTopology> = {}) {
  useClusterFenceStore.setState({
    topology: { clusterName: CLUSTER, readers, sources: {}, resolving: false, readersIncomplete: false, ...overrides },
  });
}

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open fence</Button>
      <FenceClusterDialog onOpenChange={setOpen} open={open} />
    </>
  );
}

function initialFence(exemptPrincipals: string[] = []) {
  const response = fenceStatus(ClusterFenceState.UNFENCED, 2n, exemptPrincipals);
  return create(GetClusterFenceStatusResponseSchema, {
    fence: response.fence,
    brokers: [1, 2].map((nodeId) => ({ nodeId, fence: response.fence })),
  });
}

type OwnLinks = { shadowLinks: Array<{ name: string; state: ShadowLinkState }> };

type FenceOptions = {
  initial?: GetClusterFenceStatusResponse;
  links?: OwnLinks | Promise<OwnLinks>;
  fenceError?: ConnectError;
};

function nextRevision(expectedRevision: bigint | undefined) {
  if (expectedRevision === undefined) {
    throw new ConnectError('missing expected revision', Code.InvalidArgument);
  }
  return expectedRevision + 1n;
}

function createFenceServer({ initial = initialFence(), links = { shadowLinks: [] }, fenceError }: FenceOptions) {
  const writes: FenceRequest[] = [];
  const settings: UpdateClusterFenceSettingsRequest[] = [];
  let failure = fenceError;
  const server = serveFenceStatus(initial, ({ rpc }) => {
    rpc(listShadowLinks, () => links);
    rpc(updateClusterFenceSettings, (request) => {
      settings.push(request);
      const saved = create(GetClusterFenceStatusResponseSchema, {
        fence: {
          state: ClusterFenceState.UNFENCED,
          revision: nextRevision(request.expectedRevision),
          settings: request.settings,
        },
      });
      server.publish(saved);
      return { fence: saved.fence };
    });
    rpc(fence, (request) => {
      writes.push(request);
      if (failure) {
        const rejected = failure;
        failure = undefined;
        throw rejected;
      }
      const fenced = fenceStatus(ClusterFenceState.FENCING, nextRevision(request.expectedRevision));
      server.publish(fenced);
      return { fence: fenced.fence };
    });
  });
  return { ...server, writes, settings };
}

async function renderDialog(options: FenceOptions = {}) {
  const server = createFenceServer(options);
  const rendered = await renderWithFenceStatus(<Harness />, server.transport);
  const publish = async (response: GetClusterFenceStatusResponse) => {
    server.publish(response);
    await act(async () => {
      await readFenceStatus(rendered.queryClient, server.transport);
    });
  };
  return { ...rendered, ...server, publish };
}

async function confirmWith(user: ReturnType<typeof userEvent.setup>, name = CLUSTER) {
  await user.type(await screen.findByTestId(CONFIRMATION), name);
}

const waitForClose = () => waitFor(() => expect(screen.queryByTestId(DIALOG)).not.toBeInTheDocument());

async function renderConfirmed(options: FenceOptions = {}) {
  const user = userEvent.setup();
  const dialog = await renderDialog(options);
  await confirmWith(user);
  await waitFor(() => expect(screen.getByTestId(CONFIRM)).toBeEnabled());
  return { user, ...dialog };
}

beforeEach(() => {
  enableFenceFixtures();
  setReaders();
});

describe('the FenceClusterDialog', () => {
  describe('its settings', () => {
    test('prefills the principals of the links that read from the cluster', async () => {
      await renderDialog();

      expect(await screen.findByTestId('cluster-fence-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.getByTestId('fence-preflight-readers')).toHaveAttribute('data-status', 'pass');
    });

    test('a User: name is flagged once, with a one-click fix to the bare name', async () => {
      const user = userEvent.setup();
      await renderDialog({ initial: initialFence(['User:shadow-orders']) });

      expect(await screen.findAllByText('matches nobody', { exact: false })).toHaveLength(1);
      expect(screen.queryByTestId('fence-preflight-policy-prefix-User:shadow-orders')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Use shadow-orders' }));
      expect(screen.getByTestId('cluster-fence-exempt-principals-chip-shadow-orders')).toBeVisible();
      expect(screen.queryByTestId('cluster-fence-exempt-principals-chip-User:shadow-orders')).not.toBeInTheDocument();
    });

    test('a typed User: prefix is dropped, since Redpanda only matches bare names', async () => {
      const user = userEvent.setup();
      setReaders([]);
      await renderDialog();

      await user.type(await screen.findByTestId('cluster-fence-exempt-principals-field'), 'User:shadow-audit{Enter}');
      expect(screen.getByTestId('cluster-fence-exempt-principals-chip-shadow-audit')).toBeVisible();
      expect(screen.queryByText('matches nobody', { exact: false })).not.toBeInTheDocument();
    });

    test('warns about an empty policy without blocking confirmation', async () => {
      setReaders([]);
      await renderConfirmed();

      expect(screen.getByTestId('cluster-fence-settings-warning-empty')).toHaveTextContent('every shadow link’s user');
      expect(screen.getByTestId(CONFIRM)).toBeEnabled();
    });
  });

  describe('its preflight checks', () => {
    test('waits for the own-link and reader checks instead of treating an unresolved list as empty', async () => {
      const user = userEvent.setup();
      const links = Promise.withResolvers<OwnLinks>();
      onTestFinished(() => links.resolve({ shadowLinks: [] }));
      setReaders([], { resolving: true });
      await renderDialog({ links: links.promise });

      expect(await screen.findByTestId('fence-preflight-own-links')).toHaveAttribute('data-status', 'pending');
      expect(screen.getByTestId('fence-preflight-readers')).toHaveAttribute('data-status', 'pending');
      await confirmWith(user);
      expect(screen.getByTestId(CONFIRM)).toBeDisabled();
    });

    test('self-hosted, a healthy cluster with no reader inventory can be fenced', async () => {
      const user = userEvent.setup();
      useClusterFenceStore.setState({ topology: null });
      await renderDialog();
      await confirmWith(user, 'fence');

      await waitFor(() => expect(screen.getByTestId(CONFIRM)).toBeEnabled());
      expect(screen.queryByTestId('fence-preflight-checks')).not.toBeInTheDocument();
    });

    test('keeps its original confirmation word even when the cluster name loads later', async () => {
      const user = userEvent.setup();
      setReaders([], { clusterName: undefined, resolving: true });
      await renderDialog();
      await confirmWith(user, 'fence');
      act(() => setReaders([]));

      await waitFor(() => expect(screen.getByTestId(CONFIRM)).toBeEnabled());
    });

    test('an active inbound link prevents fencing', async () => {
      const user = userEvent.setup();
      await renderDialog({ links: { shadowLinks: [{ name: 'inbound-dr', state: ShadowLinkState.ACTIVE }] } });

      await waitFor(() =>
        expect(screen.getByTestId('fence-preflight-own-links')).toHaveAttribute('data-status', 'fail')
      );
      await confirmWith(user);
      expect(screen.getByTestId(CONFIRM)).toBeDisabled();
    });

    test('warns when a reader would be fenced out', async () => {
      const user = userEvent.setup();
      await renderDialog();

      await user.click(await screen.findByLabelText('Remove tag'));
      expect(screen.getByTestId('fence-preflight-reader-orders-dr')).toHaveAttribute('data-status', 'warn');
      expect(screen.queryByTestId('fence-preflight-policy-empty')).not.toBeInTheDocument();
    });
  });

  describe('fencing', () => {
    test('saves the reviewed policy before fencing at the revision returned by that save', async () => {
      const user = userEvent.setup();
      const { settings, writes } = await renderDialog();
      const confirm = screen.getByTestId(CONFIRM);
      expect(confirm).toBeDisabled();
      await confirmWith(user);
      await waitFor(() => expect(confirm).toBeEnabled());
      await user.click(confirm);

      await waitForClose();
      expect(settings).toMatchObject([
        {
          settings: { readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads: false } },
          updateMask: { paths: ['read_policy'] },
          expectedRevision: 2n,
        },
      ]);
      expect(writes.map(({ expectedRevision }) => expectedRevision)).toEqual([3n]);
    });

    test('blocks a stale confirmation until the new settings and revision are reviewed', async () => {
      const { user, publish, writes } = await renderConfirmed();
      const newer = create(GetClusterFenceStatusResponseSchema, {
        fence: {
          state: ClusterFenceState.UNFENCED,
          revision: 5n,
          settings: { readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads: true } },
        },
      });
      await publish(newer);

      expect(await screen.findByTestId(CHANGED)).toBeVisible();
      expect(screen.getByTestId(CONFIRM)).toBeDisabled();
      await user.click(screen.getByTestId(REVIEW));
      expect(screen.queryByTestId(CHANGED)).not.toBeInTheDocument();
      expect(screen.getByTestId('cluster-fence-allow-all-reads')).toBeChecked();
      await user.click(screen.getByTestId(CONFIRM));
      await waitFor(() => expect(writes.map(({ expectedRevision }) => expectedRevision)).toEqual([5n]));
    });

    test('says so when someone else fenced the cluster while it was open', async () => {
      const user = userEvent.setup();
      const { publish } = await renderDialog();
      await publish(fenceStatus(ClusterFenceState.FENCING, 3n));
      await user.click(await screen.findByTestId(REVIEW));

      expect(screen.getByTestId('fence-cluster-already-fenced')).toHaveTextContent('already fencing');
      expect(screen.getByTestId(CONFIRM)).toBeDisabled();
    });

    test('keeps saved settings when fencing fails and retries without saving them again', async () => {
      const fenceError = new ConnectError('a data migration is still running', Code.FailedPrecondition);
      const { user, settings, writes } = await renderConfirmed({ fenceError });

      await user.click(screen.getByTestId(CONFIRM));
      expect(await screen.findByTestId('fence-cluster-error')).toHaveTextContent(
        'Settings saved, but the cluster isn’t fenced'
      );
      expect(screen.queryByTestId(CHANGED)).not.toBeInTheDocument();
      await user.click(screen.getByTestId(CONFIRM));

      await waitForClose();
      expect(settings).toHaveLength(1);
      expect(writes.map(({ expectedRevision }) => expectedRevision)).toEqual([3n, 3n]);
    });

    test('starts over after Cancel', async () => {
      const { user } = await renderConfirmed();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitForClose();
      await user.click(screen.getByRole('button', { name: 'Open fence' }));

      expect(await screen.findByTestId(CONFIRMATION)).toHaveValue('');
      expect(screen.getByTestId(CONFIRM)).toBeDisabled();
    });
  });
});
