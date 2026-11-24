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

import { beforeEach, expect, test } from '@rstest/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from 'components/redpanda-ui/components/button';
import {
  ClusterFenceState,
  type UpdateClusterFenceSettingsRequest,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { updateClusterFenceSettings } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { useState } from 'react';
import { Toaster } from 'sonner';

import { enableFenceFixtures, fenceStatus, renderWithFenceStatus, serveFenceStatus } from './cluster-fence.test-utils';
import { ClusterFenceSettingsDialog } from './cluster-fence-settings-dialog';

const SAVE = 'save-cluster-fence-settings';
const DIALOG = 'cluster-fence-settings-dialog';

beforeEach(enableFenceFixtures);

function SettingsHarness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Toaster />
      <Button onClick={() => setOpen(true)}>Open fence settings</Button>
      <ClusterFenceSettingsDialog onOpenChange={setOpen} open={open} />
    </>
  );
}

async function renderSettings(state: ClusterFenceState) {
  const requests: UpdateClusterFenceSettingsRequest[] = [];
  const server = serveFenceStatus(fenceStatus(state), ({ rpc }) => {
    rpc(updateClusterFenceSettings, (request) => {
      requests.push(request);
      const saved = fenceStatus(state, 5n, request.settings?.readPolicy?.exemptPrincipals);
      server.publish(saved);
      return { fence: saved.fence };
    });
  });
  await renderWithFenceStatus(<SettingsHarness />, server.transport);
  return requests;
}

test('saves the whole read policy at the revision the dialog opened with', async () => {
  const user = userEvent.setup();
  const requests = await renderSettings(ClusterFenceState.UNFENCED);
  const save = await screen.findByTestId(SAVE);
  expect(save).toBeDisabled();
  await user.type(screen.getByLabelText('Exempt users'), 'shadow-telemetry{Enter}');
  await user.click(save);

  expect(await screen.findByText('The next Fence uses them.')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    settings: { readPolicy: { exemptPrincipals: ['shadow-orders', 'shadow-telemetry'], allowAllReads: false } },
    expectedRevision: 4n,
    updateMask: { paths: ['read_policy'] },
  });
});

test.each([
  [ClusterFenceState.FENCED, true],
  [ClusterFenceState.UNFENCING, false],
] as const)('warns that a save re-applies the fence only in a blocking state: %s', async (phase, refences) => {
  await renderSettings(phase);
  await screen.findByTestId(SAVE);
  expect(screen.queryByText('back in Fencing', { exact: false }) !== null).toBe(refences);
});

test('drops unsaved settings on Cancel', async () => {
  const user = userEvent.setup();
  const requests = await renderSettings(ClusterFenceState.UNFENCED);
  await user.type(await screen.findByLabelText('Exempt users'), 'scratch{Enter}');
  expect(screen.getByTestId('cluster-fence-exempt-principals-chip-scratch')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByTestId(DIALOG)).not.toBeInTheDocument());

  await user.click(screen.getByRole('button', { name: 'Open fence settings' }));
  await screen.findByTestId(SAVE);
  expect(screen.queryByTestId('cluster-fence-exempt-principals-chip-scratch')).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});
