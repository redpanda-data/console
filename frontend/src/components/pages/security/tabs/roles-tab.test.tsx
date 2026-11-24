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

import { createRouterTransport } from '@connectrpc/connect';
import { expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { DeleteRoleRequest } from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { deleteRole, listRoles } from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

import { RolesTab } from './roles-tab';

const ROLE = 'topic reader/qa';

function renderRoles() {
  const deletions: DeleteRoleRequest[] = [];
  let roles = [{ name: ROLE }];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(listRoles, () => ({ roles }));
    rpc(deleteRole, (request) => {
      deletions.push(request);
      roles = roles.filter((role) => role.name !== request.roleName);
      return {};
    });
  });
  renderWithFileRoutes(
    <NuqsTestingAdapter>
      <RolesTab />
    </NuqsTestingAdapter>,
    { initialLocation: '/security/roles', transport }
  );
  return deletions;
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId(`role-actions-button-${ROLE}`));
  await user.click(await screen.findByTestId(`delete-role-button-${ROLE}`));
  const dialog = within(await screen.findByRole('dialog', { name: `Delete role ${ROLE}` }));
  const confirm = dialog.getByRole('button', { name: 'Delete' });

  expect(confirm).toBeDisabled();
  await user.type(dialog.getByPlaceholderText(ROLE), ROLE);
  await user.click(confirm);
}

test('deletes the selected role and its ACLs only after typing its full name', async () => {
  const user = userEvent.setup();
  const removals = renderRoles();
  expect(await screen.findByRole('link', { name: ROLE })).toBeVisible();

  await confirmDelete(user);

  await waitFor(() => expect(screen.queryByRole('link', { name: ROLE })).not.toBeInTheDocument());
  expect(removals).toHaveLength(1);
  expect(removals[0]).toMatchObject({ roleName: ROLE, deleteAcls: true });
  expect(screen.queryByRole('dialog', { name: `Delete role ${ROLE}` })).not.toBeInTheDocument();
});
