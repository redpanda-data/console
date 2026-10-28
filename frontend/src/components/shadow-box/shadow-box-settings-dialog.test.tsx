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
import { useShadowBoxStore } from 'stores/shadow-box-store';
import { renderWithFileRoutes } from 'test-utils';

const mutate = rs.fn();
const mutation = { mutate, reset: rs.fn(), isPending: false, isSuccess: false, error: null as unknown };

rs.mock('react-query/api/shadow-box', () => {
  const actual = rs.requireActual<typeof import('react-query/api/shadow-box')>('react-query/api/shadow-box');
  return {
    ...actual,
    useShadowBoxStatusQuery: rs.fn(),
    useUpdateShadowBoxSettingsMutation: rs.fn(() => mutation),
  };
});
rs.mock('sonner', () => ({ toast: { success: rs.fn(), error: rs.fn() } }));

import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { toast } from 'sonner';

import type { BoxPhase } from './shadow-box-model';
import { ShadowBoxSettingsDialog } from './shadow-box-settings-dialog';

const mockStatus = (phase: BoxPhase, revision = 4) =>
  rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
    summary: {
      phase,
      revision: BigInt(revision),
      exemptPrincipals: ['shadow-orders'],
      allowAllReads: false,
      skipTransactionExpiration: false,
    },
  } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);

let reopen: () => void = () => undefined;

const Harness = () => {
  const [open, setOpen] = useState(true);
  reopen = () => setOpen(true);
  return <ShadowBoxSettingsDialog onOpenChange={setOpen} open={open} />;
};

describe('the ShadowBoxSettingsDialog', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mutation.error = null;
    useShadowBoxStore.setState({ topology: null });
  });

  test('saves the edited settings at the revision it opened with', async () => {
    const user = userEvent.setup();
    mockStatus('unboxed');
    mutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    renderWithFileRoutes(<Harness />);

    const save = await screen.findByTestId('save-shadow-box-settings');
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Exempt users'), 'shadow-telemetry{Enter}');
    await user.click(save);

    expect(mutate.mock.calls[0]?.[0]).toEqual({
      settings: {
        exemptPrincipals: ['shadow-orders', 'shadow-telemetry'],
        allowAllReads: false,
        skipTransactionExpiration: false,
      },
      expectedRevision: 4n,
    });
    expect(toast.success).toHaveBeenCalledWith('Shadow box settings saved', { description: 'The next Box uses them.' });
  });

  test('says a save while boxed re-applies the box', async () => {
    mockStatus('boxed');
    renderWithFileRoutes(<Harness />);

    expect(await screen.findByTestId('shadow-box-settings-rebox')).toHaveTextContent('back in Boxing');
  });

  test('a save while unboxing doesn’t claim to re-apply the box', async () => {
    mockStatus('unboxing');
    renderWithFileRoutes(<Harness />);

    await screen.findByTestId('save-shadow-box-settings');
    expect(screen.queryByTestId('shadow-box-settings-rebox')).not.toBeInTheDocument();
  });

  test('drops unsaved edits on Cancel', async () => {
    const user = userEvent.setup();
    mockStatus('unboxed');
    renderWithFileRoutes(<Harness />);

    await user.type(await screen.findByLabelText('Exempt users'), 'scratch{Enter}');
    expect(screen.getByTestId('shadow-box-exempt-principals-chip-scratch')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('shadow-box-settings-dialog')).not.toBeInTheDocument());

    act(() => reopen());

    await screen.findByTestId('save-shadow-box-settings');
    expect(screen.queryByTestId('shadow-box-exempt-principals-chip-scratch')).not.toBeInTheDocument();
  });
});
