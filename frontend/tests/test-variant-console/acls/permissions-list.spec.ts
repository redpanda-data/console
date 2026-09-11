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

import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

function generateUsername(): string {
  const rand = Math.random().toString(36).substring(2, 7);
  return `e2e-perm-${rand}`;
}

async function createScramUser(page: Page, username: string) {
  await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('create-user-button')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('create-user-button').click();
  await page.getByTestId('create-user-name').fill(username);
  await page.getByTestId('create-user-submit').click();
  await expect(page.getByTestId('user-created-successfully')).toBeVisible();
  await page.getByTestId('done-button').click();
  await expect(page).toHaveURL('/security/users');
}

/** Grants a single cluster-level ALLOW ALL ACL to `username` via the Permissions List "Create ACL" dialog. */
async function createAclForUser(page: Page, username: string) {
  await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create ACL' }).first().click();

  await expect(page.getByRole('dialog', { name: 'Add ACL' })).toBeVisible();
  await page.getByPlaceholder('Select or type a user...').fill(username);
  await page.getByRole('option', { name: username, exact: true }).click();

  await page.getByLabel('Resource Type').click();
  await page.getByRole('option', { name: 'Cluster' }).click();

  await page.getByRole('button', { name: 'Add ACL' }).click();
  await expect(page.getByRole('dialog', { name: 'Add ACL' })).not.toBeVisible();
}

async function openPrincipalRow(page: Page, principalName: string) {
  await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Search principals, resources, roles...').fill(principalName);
  const row = page.getByTestId(`row-${principalName}`);
  await expect(row).toBeVisible({ timeout: 5000 });
  return row;
}

async function openDeleteDropdown(page: Page, principalName: string) {
  const row = await openPrincipalRow(page, principalName);
  const actions = row.getByTestId(`actions-${principalName}`);
  await actions.getByRole('button').click();
}

test.describe('Permissions List - delete dropdown', () => {
  test('SCRAM user with ACLs: all three delete options are visible', async ({ page }) => {
    const username = generateUsername();

    await test.step('Create SCRAM user with ACLs', async () => {
      await createScramUser(page, username);
      await createAclForUser(page, username);
    });

    await test.step('Open dropdown and verify options', async () => {
      await openDeleteDropdown(page, username);

      await expect(page.getByRole('menuitem', { name: 'Delete (User and ACLs)' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Delete (User only)' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Delete (ACLs only)' })).toBeVisible();
    });
  });

  test('Delete (User and ACLs) removes user and ACLs', async ({ page }) => {
    test.setTimeout(120_000);
    const username = generateUsername();

    await test.step('Create SCRAM user with ACLs', async () => {
      await createScramUser(page, username);
      await createAclForUser(page, username);
    });

    await test.step('Delete via dropdown', async () => {
      await openDeleteDropdown(page, username);
      await page.getByRole('menuitem', { name: 'Delete (User and ACLs)' }).click();

      await expect(page.getByTestId('txt-confirmation-delete')).toBeVisible({ timeout: 5000 });
      await page.getByTestId('txt-confirmation-delete').fill(username);
      await page.getByTestId('test-delete-item').click();
      // Wait for the confirm dialog to close — it only does so once the delete mutation resolves.
      await expect(page.getByTestId('txt-confirmation-delete')).not.toBeVisible({ timeout: 10_000 });
    });

    await test.step('Verify removed from permissions list', async () => {
      await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('Search principals, resources, roles...').fill(username);
      await expect(page.getByTestId(`row-${username}`)).not.toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify user also removed', async () => {
      await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('Filter by name (regexp)...').fill(username);
      await expect(page.getByRole('link', { name: username, exact: true })).not.toBeVisible({ timeout: 5000 });
    });
  });

  test('Delete (ACLs only) removes ACLs but SCRAM user remains', async ({ page }) => {
    test.setTimeout(120_000);
    const username = generateUsername();

    await test.step('Create SCRAM user with ACLs', async () => {
      await createScramUser(page, username);
      await createAclForUser(page, username);
    });

    await test.step('Delete ACLs only via dropdown', async () => {
      await openDeleteDropdown(page, username);
      await page.getByRole('menuitem', { name: 'Delete (ACLs only)' }).click();
      await page.getByRole('button', { name: 'Delete ACLs' }).click();
    });

    await test.step('Verify SCRAM user still exists', async () => {
      await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('Filter by name (regexp)...').fill(username);
      await expect(page.getByRole('link', { name: username, exact: true })).toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify ACLs removed', async () => {
      // The principal row persists (the user still exists) but its ACL count drops to zero.
      const row = await openPrincipalRow(page, username);
      await row.click();
      await expect(row.getByText('No ACLs assigned')).toBeVisible({ timeout: 5000 });
    });
  });
});
