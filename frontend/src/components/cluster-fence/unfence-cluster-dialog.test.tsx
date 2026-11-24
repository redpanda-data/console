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
import { beforeEach, expect, test } from '@rstest/core';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClusterFenceState, type UnfenceRequest } from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { unfence } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { useState } from 'react';
import { Toaster } from 'sonner';

import {
  enableFenceFixtures,
  fenceStatus,
  readFenceStatus,
  renderWithFenceStatus,
  serveFenceStatus,
} from './cluster-fence.test-utils';
import { UnfenceClusterDialog } from './unfence-cluster-dialog';

const CONFIRM = 'confirm-unfence-cluster';
beforeEach(enableFenceFixtures);

function UnfenceHarness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <UnfenceClusterDialog clusterName="prod-us-east-1" onOpenChange={setOpen} open={open} />
    </>
  );
}

function renderUnfence(state = ClusterFenceState.FENCED, revision = 7n, failure?: ConnectError) {
  const requests: UnfenceRequest[] = [];
  const server = serveFenceStatus(fenceStatus(state, revision), ({ rpc }) => {
    rpc(unfence, (request) => {
      requests.push(request);
      if (failure) {
        throw failure;
      }
      const released = fenceStatus(ClusterFenceState.UNFENCING, revision + 1n);
      server.publish(released);
      return { fence: released.fence };
    });
  });
  return { ...server, requests, ready: renderWithFenceStatus(<UnfenceHarness />, server.transport) };
}

test('warns about clients writing to an old source and unfences at the displayed revision', async () => {
  const user = userEvent.setup();
  const { requests, ready } = renderUnfence();
  await ready;

  expect(await screen.findByText('Unfence prod-us-east-1?')).toBeVisible();
  expect(screen.getByTestId('unfence-cluster-dialog')).toHaveTextContent(
    'Any client still pointed at this cluster can write to it again'
  );

  await user.click(screen.getByTestId(CONFIRM));
  expect(await screen.findByText('Unfencing prod-us-east-1')).toBeVisible();
  expect(requests.map((request) => request.expectedRevision)).toEqual([7n]);
});

test('explains a rejected release when the server revision has changed', async () => {
  const user = userEvent.setup();
  const conflict = new ConnectError('Cluster fencing revision has changed', Code.FailedPrecondition);
  await renderUnfence(ClusterFenceState.FENCED, 7n, conflict).ready;

  await user.click(await screen.findByTestId(CONFIRM));
  expect(await screen.findByTestId('unfence-cluster-error')).toHaveTextContent(
    'Someone else changed the fence since this page read it.'
  );
});

test('won’t send a write for a revision that changed while the dialog was open', async () => {
  const server = renderUnfence();
  const { queryClient } = await server.ready;
  expect(screen.getByTestId(CONFIRM)).toBeEnabled();

  server.publish(fenceStatus(ClusterFenceState.FENCING, 9n));
  await act(() => readFenceStatus(queryClient, server.transport));

  expect(await screen.findByTestId('cluster-fence-changed')).toBeVisible();
  expect(screen.getByTestId(CONFIRM)).toBeDisabled();
  expect(server.requests).toHaveLength(0);
});

test('has nothing to do once the cluster is already unfencing', async () => {
  const { requests, ready } = renderUnfence(ClusterFenceState.UNFENCING, 8n);
  await ready;
  expect(await screen.findByTestId('unfence-cluster-already-released')).toHaveTextContent('already unfencing');
  expect(screen.getByTestId(CONFIRM)).toBeDisabled();
  expect(requests).toHaveLength(0);
});
