/**
 * spec: UX-1208 — Phase 1 e2e test coverage (CRITICAL + HIGH)
 * parent epic: UX-1198 — REST-to-Connect RPC migration
 *
 * Guards the Casbin→PERMISSION_VIEW swap for users/ACLs/quotas: view-only roles MUST be able
 * to list (all three are PERMISSION_VIEW in the dataplane proto) but MUST NOT be able to
 * create/update/delete (those are PERMISSION_ADMIN).
 *
 * Blocked on: new view-only auth fixture (playwright/.auth/view-only.json) — see UX-1209.
 */

import { expect, test } from '@playwright/test';

// TODO(UX-1209): flip to true once the view-only fixture lands. All assertions below are
// ready; only the seeded role and storageState are missing.
const VIEW_ONLY_STORAGE_STATE = 'playwright/.auth/view-only.json';
const VIEW_ONLY_FIXTURE_READY = false;

test.describe('Authorization - Users page (view-only role)', () => {
  test.skip(!VIEW_ONLY_FIXTURE_READY, 'view-only auth fixture pending — see UX-1209');
  test.use({ storageState: VIEW_ONLY_STORAGE_STATE });

  test('users list renders for view-only role', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });

    // Structural: the page loads (not a 403 / permission-denied boundary).
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // At least one row (the seeded view-only user itself should be present).
    const rows = page.getByRole('row');
    await expect(rows).not.toHaveCount(0);
  });

  test('create user button is hidden or disabled for view-only role', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });

    // Structural: the Create button is either absent or disabled — both acceptable.
    const createButton = page.getByTestId('create-user-button');
    const isVisible = await createButton.isVisible().catch(() => false);
    if (isVisible) {
      await expect(createButton).toBeDisabled();
    } else {
      await expect(createButton).not.toBeVisible();
    }

    // Direct navigation: /security/users/create should NOT show a working create form.
    // The form may either be hidden entirely (route redirect) or rendered with the submit
    // disabled (inline permission gate) — both are acceptable view-only behaviors.
    await page.goto('/security/users/create', { waitUntil: 'domcontentloaded' });
    const submitButton = page.getByTestId('create-user-submit');
    const submitVisible = await submitButton.isVisible().catch(() => false);
    if (submitVisible) {
      await expect(submitButton).toBeDisabled();
    }
  });

  test('delete user button is not available on details page for view-only role', async ({ page }) => {
    // The seeded view-only user should be visible in the list.
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    // Click the first user link (whichever exists — we don't care which one).
    const firstUserLink = page.locator("a[href^='/security/users/'][href$='/details']").first();
    await expect(firstUserLink).toBeVisible();
    await firstUserLink.click();

    // Structural: Delete button is hidden or disabled.
    const deleteBtn = page.getByRole('button', { name: 'Delete user' });
    const deleteVisible = await deleteBtn.isVisible().catch(() => false);
    if (deleteVisible) {
      await expect(deleteBtn).toBeDisabled();
    } else {
      await expect(deleteBtn).not.toBeVisible();
    }
  });
});

test.describe('Authorization - ACLs page (view-only role)', () => {
  test.skip(!VIEW_ONLY_FIXTURE_READY, 'view-only auth fixture pending — see UX-1209');
  test.use({ storageState: VIEW_ONLY_STORAGE_STATE });

  test('ACLs list is visible but Create ACL is blocked', async ({ page }) => {
    await page.goto('/security/acls', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/security/acls');

    // Structural: Create ACL button hidden or disabled.
    const createAcl = page.getByTestId('create-acls');
    const createVisible = await createAcl.isVisible().catch(() => false);
    if (createVisible) {
      await expect(createAcl).toBeDisabled();
    } else {
      await expect(createAcl).not.toBeVisible();
    }

    // Direct-nav: /security/acls/create should not present a working form.
    await page.goto('/security/acls/create', { waitUntil: 'domcontentloaded' });
    const principalInput = page.getByTestId('shared-principal-input');
    const principalVisible = await principalInput.isVisible().catch(() => false);
    if (principalVisible) {
      await expect(principalInput).toBeDisabled();
    }
  });

  test('DeleteACLs dropdown items are hidden in permissions list for view-only', async ({ page }) => {
    await page.goto('/security/permissions-list', { waitUntil: 'domcontentloaded' });

    // Find any row and open its dropdown.
    const firstRow = page.getByRole('row').nth(1); // nth(0) is the header
    const rowExists = await firstRow.isVisible().catch(() => false);
    test.skip(!rowExists, 'no permission-list rows to exercise; seed required');

    await firstRow.getByRole('button').click();

    // Structural: all three delete options are absent or disabled for view-only role.
    for (const testId of ['delete-user-and-acls', 'delete-user-only', 'delete-acls-only']) {
      const item = page.getByTestId(testId);
      const isVisible = await item.isVisible().catch(() => false);
      if (isVisible) {
        await expect(item).toBeDisabled();
      } else {
        await expect(item).not.toBeVisible();
      }
    }
  });
});

test.describe('Authorization - Quotas page (view-only role)', () => {
  test.skip(!VIEW_ONLY_FIXTURE_READY, 'view-only auth fixture pending — see UX-1209');
  test.use({ storageState: VIEW_ONLY_STORAGE_STATE });

  test('quotas table loads for view-only role', async ({ page }) => {
    await page.goto('/quotas', { waitUntil: 'domcontentloaded' });

    // Structural: heading renders.
    await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible({ timeout: 10_000 });

    // Column headers are visible (the table is rendered even if zero quotas).
    await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  });
});
