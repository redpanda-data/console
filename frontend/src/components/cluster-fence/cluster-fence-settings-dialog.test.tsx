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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { renderWithFileRoutes } from 'test-utils';

const mutate = rs.fn();
const mutation = { mutate, reset: rs.fn(), isPending: false, isSuccess: false, error: null as unknown };

rs.mock('react-query/api/cluster-fence', () => {
  const actual = rs.requireActual<typeof import('react-query/api/cluster-fence')>('react-query/api/cluster-fence');
  return {
    ...actual,
    useClusterFenceStatusQuery: rs.fn(),
    useUpdateClusterFenceSettingsMutation: rs.fn(() => mutation),
  };
});
rs.mock('sonner', () => ({ toast: { success: rs.fn(), error: rs.fn() } }));

import { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';
import { toast } from 'sonner';

import type { FencePhase } from './cluster-fence-model';
import { ClusterFenceSettingsDialog } from './cluster-fence-settings-dialog';

const mockStatus = (phase: FencePhase, revision = 4) =>
  rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
    summary: {
      phase,
      revision: BigInt(revision),
      exemptPrincipals: ['shadow-orders'],
      allowAllReads: false,
    },
  } as unknown as ReturnType<typeof useClusterFenceStatusQuery>);

let reopen: () => void = () => undefined;

const Harness = () => {
  const [open, setOpen] = useState(true);
  reopen = () => setOpen(true);
  return <ClusterFenceSettingsDialog onOpenChange={setOpen} open={open} />;
};

describe('the ClusterFenceSettingsDialog', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mutation.error = null;
    useClusterFenceStore.setState({ topology: null });
  });

  test('saves the edited settings at the revision it opened with', async () => {
    const user = userEvent.setup();
    mockStatus('unfenced');
    mutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    renderWithFileRoutes(<Harness />);

    const save = await screen.findByTestId('save-cluster-fence-settings');
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Exempt users'), 'shadow-telemetry{Enter}');
    await user.click(save);

    expect(mutate.mock.calls[0]?.[0]).toEqual({
      settings: {
        exemptPrincipals: ['shadow-orders', 'shadow-telemetry'],
        allowAllReads: false,
      },
      expectedRevision: 4n,
    });
    expect(toast.success).toHaveBeenCalledWith('Cluster fence settings saved', {
      description: 'The next Fence uses them.',
    });
  });

  test.each([
    ['fenced', true],
    ['unfencing', false],
  ] as const)('a save while %s re-applies the fence: %s', async (phase, refences) => {
    mockStatus(phase);
    renderWithFileRoutes(<Harness />);

    await screen.findByTestId('save-cluster-fence-settings');
    expect(screen.queryByText('back in Fencing', { exact: false }) !== null).toBe(refences);
  });

  test('drops unsaved edits on Cancel', async () => {
    const user = userEvent.setup();
    mockStatus('unfenced');
    renderWithFileRoutes(<Harness />);

    await user.type(await screen.findByLabelText('Exempt users'), 'scratch{Enter}');
    expect(screen.getByTestId('cluster-fence-exempt-principals-chip-scratch')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('cluster-fence-settings-dialog')).not.toBeInTheDocument());

    act(() => reopen());

    await screen.findByTestId('save-cluster-fence-settings');
    expect(screen.queryByTestId('cluster-fence-exempt-principals-chip-scratch')).not.toBeInTheDocument();
  });
});
