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

import { describe, expect, rs, test } from '@rstest/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// The Playwright spec cannot reach the row menu — a fresh cluster has no ACLs — so it is covered
// here, along with the delete-option enablement.

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    Link: ({ children, to, ...props }: { children: ReactNode; to?: string; [key: string]: unknown }) => (
      <a href={to ?? ''} {...props}>
        {children}
      </a>
    ),
    useNavigate: () => rs.fn(),
  };
});

rs.mock('../../../misc/section', () => ({
  default: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
}));

rs.mock('../shared/security-tabs-nav', () => ({
  SecurityTabsNav: () => null,
}));

rs.mock('../../../../components/misc/error-result', () => ({
  default: () => null,
}));

rs.mock('../../../../state/backend-api', () => ({
  api: { refreshAcls: rs.fn().mockResolvedValue(undefined) },
}));

rs.mock('../../../../state/rest-interfaces', () => ({
  AclRequestDefault: {},
}));

rs.mock('../../../../state/supported-features', () => ({
  useSupportedFeaturesStore: <T,>(selector: (s: Record<string, boolean>) => T) =>
    selector({ deleteUser: true, rolesApi: true }),
}));

rs.mock('../../../../react-query/api/cluster-status', () => ({
  useGetRedpandaInfoQuery: () => ({ data: { version: 'v26.1' }, isSuccess: true }),
}));

rs.mock('../../../../react-query/api/user', () => ({
  useInvalidateUsersCache: () => rs.fn(),
  useDeleteUserMutation: () => ({ mutateAsync: rs.fn().mockResolvedValue(undefined) }),
  // `acl-only` has ACLs but no account.
  useListUsersQuery: () => ({ data: { users: [{ name: 'scram-admin' }, { name: 'shadowed' }] }, isLoading: false }),
}));

rs.mock('../../../../react-query/api/acl', () => ({
  useDeleteAclMutation: () => ({ mutateAsync: rs.fn().mockResolvedValue(undefined) }),
  useListACLAsPrincipalGroups: () => ({
    data: [
      { principal: 'User:scram-admin', principalType: 'User', principalName: 'scram-admin', host: '*' },
      { principal: 'User:acl-only', principalType: 'User', principalName: 'acl-only', host: '10.0.0.1' },
      { principal: 'Group:engineering', principalType: 'Group', principalName: 'engineering', host: '*' },
      // Name collides with the `shadowed` SASL user, to pin the principalType guard.
      { principal: 'Group:shadowed', principalType: 'Group', principalName: 'shadowed', host: '10.0.0.9' },
    ],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

const SORT_ASC = /Asc/;
const ACL_ROW_TESTID = /^acl-list-item-/;

const { AclsTab } = await import('./acls-tab');

const openRowMenu = async (principalName: string) => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: `Delete ACL for ${principalName}` }));
  return { user, menu: await screen.findByRole('menu') };
};

describe('AclsTab', () => {
  test('lists each ACL principal with its host', () => {
    render(<AclsTab />);

    expect(screen.getByTestId('acl-list-item-scram-admin-*')).toBeInTheDocument();
    expect(screen.getByTestId('acl-list-item-acl-only-10.0.0.1')).toBeInTheDocument();
    // A wildcard host reads as "Any"; a real one prints.
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
  });

  test('marks a Group principal', () => {
    render(<AclsTab />);

    const row = screen.getByTestId('acl-list-item-engineering-*').closest('a');
    expect(within(row as HTMLElement).getByText('Group')).toBeInTheDocument();
  });

  test('opens the row delete menu with all three options', async () => {
    render(<AclsTab />);
    const { menu } = await openRowMenu('scram-admin');

    expect(within(menu).getByRole('menuitem', { name: 'Delete (User and ACLs)' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Delete (User only)' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Delete (ACLs only)' })).toBeInTheDocument();
  });

  test('enables the user-delete options only for a principal that has an account', async () => {
    render(<AclsTab />);
    const { menu } = await openRowMenu('scram-admin');

    expect(within(menu).getByRole('menuitem', { name: 'Delete (User and ACLs)' })).not.toHaveAttribute('data-disabled');
    expect(within(menu).getByRole('menuitem', { name: 'Delete (ACLs only)' })).not.toHaveAttribute('data-disabled');
  });

  test('never offers user deletes on a Group row, even when a user shares its name', async () => {
    render(<AclsTab />);
    const { menu } = await openRowMenu('shadowed');

    expect(within(menu).getByRole('menuitem', { name: 'Delete (User and ACLs)' })).toHaveAttribute('data-disabled');
    expect(within(menu).getByRole('menuitem', { name: 'Delete (User only)' })).toHaveAttribute('data-disabled');
    expect(within(menu).getByRole('menuitem', { name: 'Delete (ACLs only)' })).not.toHaveAttribute('data-disabled');
  });

  test('sorts the Principal column by the name it renders', async () => {
    render(<AclsTab />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Principal' }));
    await user.click(await screen.findByRole('menuitem', { name: SORT_ASC }));

    const names = screen.getAllByTestId(ACL_ROW_TESTID).map((el) => el.textContent);
    expect(names).toEqual([...names].sort());
  });

  test('disables the user-delete options for an ACL-only principal', async () => {
    render(<AclsTab />);
    const { menu } = await openRowMenu('acl-only');

    expect(within(menu).getByRole('menuitem', { name: 'Delete (User and ACLs)' })).toHaveAttribute('data-disabled');
    expect(within(menu).getByRole('menuitem', { name: 'Delete (User only)' })).toHaveAttribute('data-disabled');
    // Deleting only the ACLs never depends on an account existing.
    expect(within(menu).getByRole('menuitem', { name: 'Delete (ACLs only)' })).not.toHaveAttribute('data-disabled');
  });
});
