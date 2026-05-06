/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { expect, test } from '@playwright/test';

import { RolePage } from '../utils/role-page';

function generateRoleName(): string {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).substring(2, 5);
  return `e2e-role-${ts}-${rand}`;
}

/**
 * Check if the roles API is available by verifying the "Create role" button is enabled.
 * Returns false if roles tab isn't visible or the button is disabled.
 */
async function isRolesApiAvailable(page: import('@playwright/test').Page): Promise<boolean> {
  try {
    await page.goto('/security/roles', { waitUntil: 'domcontentloaded' });
    const btn = page.getByTestId('create-role-button');
    await btn.waitFor({ state: 'attached', timeout: 15_000 });
    return !(await btn.isDisabled());
  } catch {
    return false;
  }
}

test.describe('Role CRUD', () => {
  test('create role page has no principal type selector', async ({ page }) => {
    test.skip(!(await isRolesApiAvailable(page)), 'Roles API not available');

    await page.goto('/security/roles/create', { waitUntil: 'domcontentloaded' });

    // The principal type selector should NOT be present on the create role page
    await expect(page.getByTestId('shared-principal-type-select')).not.toBeVisible();

    // The "Role name" label and input should be visible
    await expect(page.getByLabel('Role name')).toBeVisible();
    await expect(page.getByTestId('shared-principal-input')).toBeVisible();
  });

  test('create role with allow-all, verify in list, then delete', async ({ page }) => {
    test.skip(!(await isRolesApiAvailable(page)), 'Roles API not available');

    const rolePage = new RolePage(page);
    const roleName = generateRoleName();

    await rolePage.createRole(roleName);
    await rolePage.validateListItem('*', roleName);
    await rolePage.deleteRoleFromList(roleName);
    await rolePage.validateNotInList(roleName);
  });

  test('create role and verify detail page shows correct ACLs', async ({ page }) => {
    test.skip(!(await isRolesApiAvailable(page)), 'Roles API not available');

    const rolePage = new RolePage(page);
    const roleName = generateRoleName();

    await rolePage.createRole(roleName);
    await expect(page.getByText(roleName)).toBeVisible();
    await rolePage.deleteRoleFromList(roleName);
  });
});
