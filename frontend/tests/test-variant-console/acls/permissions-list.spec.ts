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

import { expect, type Page, test } from '@playwright/test';

import {
  ModeAllowAll,
  OperationTypeAllow,
  ResourcePatternTypeAny,
  ResourceTypeCluster,
} from '../../../src/components/pages/acls/new-acl/acl.model';
import { AclPage } from '../utils/acl-page';

function generateUsername(): string {
  const rand = Math.random().toString(36).substring(2, 7);
  return `e2e-perm-${rand}`;
}

async function createScramUser(page: Page, username: string) {
  await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('create-user-button')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('create-user-button').click();
  await page.getByTestId('create-user-name').fill(username);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'User created successfully' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL('/security/users');
}

async function createAclForUser(page: Page, username: string) {
  const aclPage = new AclPage(page);
  await aclPage.goto();
  await aclPage.setPrincipal(username);
  await aclPage.configureRules([
    {
      id: 1,
      resourceType: ResourceTypeCluster,
      mode: ModeAllowAll,
      selectorType: ResourcePatternTypeAny,
      selectorValue: '',
      operations: {
        ALTER: OperationTypeAllow,
        ALTER_CONFIGS: OperationTypeAllow,
        CLUSTER_ACTION: OperationTypeAllow,
        CREATE: OperationTypeAllow,
        DESCRIBE: OperationTypeAllow,
        DESCRIBE_CONFIGS: OperationTypeAllow,
        IDEMPOTENT_WRITE: OperationTypeAllow,
      },
    },
  ]);
  await aclPage.submitForm();
  await aclPage.waitForDetailPage();
}

async function openDeleteDropdown(page: Page, principalName: string) {
  await page.goto('/security/permissions-list', { waitUntil: 'domcontentloaded' });
  const searchInput = page.getByPlaceholder('Filter by name');
  await searchInput.fill(principalName);
  await expect(page.getByRole('link', { name: principalName, exact: true })).toBeVisible({ timeout: 5000 });

  const row = page.getByRole('row').filter({ hasText: principalName });
  await row.getByRole('button').click();
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
      await page.getByRole('menuitem', { name: 'Delete (User and ACLs)' }).dispatchEvent('click');

      await expect(page.getByTestId('txt-confirmation-delete')).toBeVisible({ timeout: 5000 });
      await page.getByTestId('txt-confirmation-delete').fill(username);
      await page.getByTestId('test-delete-item').click();
    });

    await test.step('Verify removed from permissions list', async () => {
      await page.waitForTimeout(1000);
      const searchInput = page.getByPlaceholder('Filter by name');
      await searchInput.fill(username);
      await expect(page.getByRole('link', { name: username, exact: true })).not.toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify ACLs also removed', async () => {
      await page.goto('/security/acls', { waitUntil: 'domcontentloaded' });
      const searchInput = page.getByPlaceholder('Filter by name');
      await searchInput.fill(username);
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
      await page.getByRole('menuitem', { name: 'Delete (ACLs only)' }).dispatchEvent('click');
    });

    await test.step('Verify SCRAM user still exists', async () => {
      await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
      const searchInput = page.getByPlaceholder('Filter by name');
      await searchInput.fill(username);
      await expect(page.getByRole('link', { name: username, exact: true })).toBeVisible({ timeout: 5000 });
    });

    await test.step('Verify ACLs removed', async () => {
      await page.goto('/security/acls', { waitUntil: 'domcontentloaded' });
      const searchInput = page.getByPlaceholder('Filter by name');
      await searchInput.fill(username);
      await expect(page.getByRole('link', { name: username, exact: true })).not.toBeVisible({ timeout: 5000 });
    });
  });
});
