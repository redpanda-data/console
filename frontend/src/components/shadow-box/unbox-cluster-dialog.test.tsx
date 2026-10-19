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

rs.mock('react-query/api/shadow-box', () => {
  const actual = rs.requireActual<typeof import('react-query/api/shadow-box')>('react-query/api/shadow-box');
  return { ...actual, useShadowBoxStatusQuery: rs.fn(), useUnboxClusterMutation: rs.fn(() => mutation) };
});
rs.mock('sonner', () => ({ toast: { success: rs.fn(), error: rs.fn() } }));

import { useState } from 'react';
import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';

import type { BoxPhase } from './shadow-box-model';
import { UnboxClusterDialog } from './unbox-cluster-dialog';

const status = (phase: BoxPhase, revision: number) =>
  ({ summary: { phase, revision: BigInt(revision) } }) as unknown as ReturnType<typeof useShadowBoxStatusQuery>;

describe('UnboxClusterDialog', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mutation.error = null;
    rs.mocked(useShadowBoxStatusQuery).mockReturnValue(status('boxed', 7));
  });

  test('warns about clients writing to an old source, and unboxes at the displayed revision', async () => {
    const user = userEvent.setup();
    renderWithFileRoutes(<UnboxClusterDialog clusterName="prod-us-east-1" onOpenChange={rs.fn()} open />);

    expect(await screen.findByText('Unbox prod-us-east-1?')).toBeVisible();
    expect(screen.getByTestId('unbox-cluster-dialog')).toHaveTextContent('clients still pointed at it start writing');

    await user.click(screen.getByTestId('confirm-unbox-cluster'));
    expect(mutate.mock.calls[0]?.[0]).toEqual({ expectedRevision: BigInt(7) });
  });

  test('says when someone else re-boxed the cluster', async () => {
    mutation.error = new ConnectError('Shadow boxing revision has changed', Code.FailedPrecondition);
    renderWithFileRoutes(<UnboxClusterDialog onOpenChange={rs.fn()} open />);

    expect(await screen.findByTestId('unbox-cluster-error')).toHaveTextContent(
      'Someone else changed the box since this page read it.'
    );
  });

  test('won’t release a box that changed after it opened', async () => {
    let rerender: () => void = () => undefined;
    const Harness = () => {
      const [, setTick] = useState(0);
      rerender = () => setTick((tick) => tick + 1);
      return <UnboxClusterDialog onOpenChange={rs.fn()} open />;
    };
    renderWithFileRoutes(<Harness />);
    await screen.findByTestId('confirm-unbox-cluster');

    rs.mocked(useShadowBoxStatusQuery).mockReturnValue(status('boxing', 9));
    act(() => rerender());

    expect(await screen.findByTestId('shadow-box-changed')).toBeVisible();
    expect(screen.getByTestId('confirm-unbox-cluster')).toBeDisabled();
  });

  test('has nothing to do once the cluster is already unboxing', async () => {
    rs.mocked(useShadowBoxStatusQuery).mockReturnValue(status('unboxing', 8));
    renderWithFileRoutes(<UnboxClusterDialog onOpenChange={rs.fn()} open />);

    expect(await screen.findByTestId('unbox-cluster-already-released')).toHaveTextContent('already unboxing');
    expect(screen.getByTestId('confirm-unbox-cluster')).toBeDisabled();
  });
});
