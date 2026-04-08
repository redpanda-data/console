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

import { test } from '@playwright/test';

import { RolePage } from '../test-variant-console/utils/role-page';

function generateRoleName(): string {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).substring(2, 5);
  return `e2e-role-${ts}-${rand}`;
}

test.describe('Roles list refresh', () => {
  test('created role appears in the roles list', async ({ page }) => {
    const rolePage = new RolePage(page);
    const roleName = generateRoleName();

    await rolePage.createRole(roleName);
    await rolePage.validateListItem('*', roleName);
  });

  test('role deleted from the list disappears from the list', async ({ page }) => {
    const rolePage = new RolePage(page);
    const roleName = generateRoleName();

    await rolePage.createRole(roleName);
    await rolePage.deleteRoleFromList(roleName);
    await rolePage.validateNotInList(roleName);
  });
});
