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

import { ConnectError } from '@connectrpc/connect';
import { describe, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { anyToast, spyOnToasts } from 'test-toasts';
import { render, screen, waitFor } from 'test-utils';

import { ChangeRolesModal } from './user-edit-modals';

const updateRoleMembershipMock = rs.fn();

rs.mock('../../../../react-query/api/security', () => ({
  useListRolesQuery: () => ({ data: { roles: [{ name: 'readers' }] }, isLoading: false }),
  useUpdateRoleMembershipMutation: () => ({ mutateAsync: updateRoleMembershipMock, isPending: false }),
}));

rs.mock('../../../../state/backend-api', () => ({
  rolesApi: {
    refreshRoles: rs.fn().mockResolvedValue(undefined),
    refreshRoleMembers: rs.fn().mockResolvedValue(undefined),
  },
}));

rs.mock('../../../../state/supported-features', () => ({
  ...rs.requireActual<typeof import('../../../../state/supported-features')>('../../../../state/supported-features'),
  useSupportedFeaturesStore: <T,>(selector: (state: { rolesApi: boolean }) => T) => selector({ rolesApi: true }),
}));

function renderModal() {
  const setIsOpen = rs.fn();
  render(
    <TooltipProvider>
      <ChangeRolesModal isOpen setIsOpen={setIsOpen} userName="alice" />
    </TooltipProvider>
  );
  return setIsOpen;
}

describe('the ChangeRolesModal', () => {
  test('stays open without a success toast when a membership update fails', async () => {
    const toasts = spyOnToasts();
    const user = userEvent.setup();
    updateRoleMembershipMock.mockRejectedValue(new ConnectError('permission denied', 7));
    const setIsOpen = renderModal();

    await user.click(await screen.findByRole('button', { name: 'Remove readers' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateRoleMembershipMock).toHaveBeenCalledTimes(1));
    expect(toasts).not.toHaveBeenCalledWith(anyToast('success'));
    expect(setIsOpen).not.toHaveBeenCalled();
    toasts.mockRestore();
  });
});
