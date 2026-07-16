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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { TooltipProvider } from '../../../redpanda-ui/components/tooltip';

const { updateMembershipMock } = vi.hoisted(() => ({
  updateMembershipMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ roleName: 'test-role' }),
}));

vi.mock('../../../../state/ui-state', () => ({
  setPageHeader: vi.fn(),
}));

vi.mock('../shared/acls-card', () => ({
  AclsCard: () => null,
}));

vi.mock('../../../../react-query/api/acl', () => ({
  useGetAclsByPrincipal: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../../../react-query/api/security', () => ({
  useListRoleMembersQuery: () => ({ data: { members: [] }, isLoading: false }),
  useUpdateRoleMembershipMutation: () => ({ mutateAsync: updateMembershipMock, isPending: false }),
}));

vi.mock('../../../../react-query/api/user', () => ({
  useListUsersQuery: () => ({ data: { users: [{ name: 'scram-user' }] } }),
}));

import { RoleDetailPageNew } from './role-detail-page-new';

const renderPage = () =>
  render(
    <TooltipProvider>
      <RoleDetailPageNew />
    </TooltipProvider>
  );

describe('RoleDetailPageNew principal assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('assigns an OIDC email principal that is absent from the SCRAM user list', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox'));
    await user.keyboard('person@email.com');
    await user.keyboard('{Enter}');

    expect(updateMembershipMock).toHaveBeenCalledTimes(1);
    expect(updateMembershipMock.mock.calls[0][0]).toMatchObject({
      roleName: 'test-role',
      add: [{ principal: 'User:person@email.com' }],
    });
  });

  test('still assigns an existing SCRAM user selected from the list', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('scram-user'));

    expect(updateMembershipMock).toHaveBeenCalledTimes(1);
    expect(updateMembershipMock.mock.calls[0][0]).toMatchObject({
      add: [{ principal: 'User:scram-user' }],
    });
  });
});
