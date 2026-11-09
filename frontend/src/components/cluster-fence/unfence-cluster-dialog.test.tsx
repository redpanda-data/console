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
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithFileRoutes } from 'test-utils';

const mutate = rs.fn();
const mutation = { mutate, reset: rs.fn(), isPending: false, error: null as unknown };

rs.mock('react-query/api/cluster-fence', () => {
  const actual = rs.requireActual<typeof import('react-query/api/cluster-fence')>('react-query/api/cluster-fence');
  return { ...actual, useClusterFenceStatusQuery: rs.fn(), useUnfenceClusterMutation: rs.fn(() => mutation) };
});
rs.mock('sonner', () => ({ toast: { success: rs.fn(), error: rs.fn() } }));

import { useState } from 'react';
import { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';

import type { FencePhase } from './cluster-fence-model';
import { UnfenceClusterDialog } from './unfence-cluster-dialog';

const status = (phase: FencePhase, revision: number) =>
  ({ summary: { phase, revision: BigInt(revision) } }) as unknown as ReturnType<typeof useClusterFenceStatusQuery>;

/** Lets a test rerender the open dialog after it changes the mocked status. */
const harness = { rerender: (): void => undefined };

function Harness() {
  const [, setTick] = useState(0);
  harness.rerender = () => setTick((tick) => tick + 1);
  return <UnfenceClusterDialog onOpenChange={rs.fn()} open />;
}

describe('the UnfenceClusterDialog', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mutation.error = null;
    rs.mocked(useClusterFenceStatusQuery).mockReturnValue(status('fenced', 7));
  });

  test('warns about clients writing to an old source, and unfences at the displayed revision', async () => {
    const user = userEvent.setup();
    renderWithFileRoutes(<UnfenceClusterDialog clusterName="prod-us-east-1" onOpenChange={rs.fn()} open />);

    expect(await screen.findByText('Unfence prod-us-east-1?')).toBeVisible();
    expect(screen.getByTestId('unfence-cluster-dialog')).toHaveTextContent('clients still pointed at it start writing');

    await user.click(screen.getByTestId('confirm-unfence-cluster'));
    expect(mutate.mock.calls[0]?.[0]).toEqual({ expectedRevision: 7n });
  });

  test('says when someone else re-fenced the cluster', async () => {
    mutation.error = new ConnectError('Cluster fencing revision has changed', Code.FailedPrecondition);
    renderWithFileRoutes(<UnfenceClusterDialog onOpenChange={rs.fn()} open />);

    expect(await screen.findByTestId('unfence-cluster-error')).toHaveTextContent(
      'Someone else changed the fence since this page read it.'
    );
  });

  test('won’t release a fence that changed after it opened', async () => {
    renderWithFileRoutes(<Harness />);
    await screen.findByTestId('confirm-unfence-cluster');

    rs.mocked(useClusterFenceStatusQuery).mockReturnValue(status('fencing', 9));
    act(() => harness.rerender());

    expect(await screen.findByTestId('cluster-fence-changed')).toBeVisible();
    expect(screen.getByTestId('confirm-unfence-cluster')).toBeDisabled();
  });

  test('has nothing to do once the cluster is already unfencing', async () => {
    rs.mocked(useClusterFenceStatusQuery).mockReturnValue(status('unfencing', 8));
    renderWithFileRoutes(<UnfenceClusterDialog onOpenChange={rs.fn()} open />);

    expect(await screen.findByTestId('unfence-cluster-already-released')).toHaveTextContent('already unfencing');
    expect(screen.getByTestId('confirm-unfence-cluster')).toBeDisabled();
  });
});
