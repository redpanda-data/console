import { definePlaywrightOptions } from '../shared/playwright-options';

// WARNING: UX-1208: view-only users must be able to list users, ACLs and quotas without gaining mutation access.

import { test as base, expect, type Locator } from '../shared/e2e';

const test = base.extend({ playwright: definePlaywrightOptions({ storageState: 'playwright/.auth/view-only.json' }) });

// WARNING: Do not enable these UX-1209 checks before the view-only role and its storageState are seeded.
const VIEW_ONLY_FIXTURE_READY = false;

const expectHiddenOrDisabled = async (control: Locator) => {
  const isVisible = await control.isVisible().catch(() => false);
  if (isVisible) {
    await expect(control).toBeDisabled();
  } else {
    await expect(control).not.toBeVisible();
  }
};

const expectDisabledIfShown = async (control: Locator) => {
  const isVisible = await control.isVisible().catch(() => false);
  if (isVisible) {
    await expect(control).toBeDisabled();
  }
};

test.describe.skipIf(!VIEW_ONLY_FIXTURE_READY)('authorization - Users page (view-only role)', () => {
  test('users list renders for view-only role', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    const rows = page.getByRole('row');
    await expect(rows).not.toHaveCount(0);
  });

  test('create user button is hidden or disabled for view-only role', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });

    await expectHiddenOrDisabled(page.getByTestId('create-user-button'));

    await page.goto('/security/users/create', { waitUntil: 'domcontentloaded' });
    await expectDisabledIfShown(page.getByTestId('create-user-submit'));
  });

  test('delete user button is not available on details page for view-only role', async ({ page }) => {
    await page.goto('/security/users', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('table')).toBeVisible({ timeout: 10_000 });

    const firstUserLink = page.locator("a[href^='/security/users/'][href$='/details']").first();
    await expect(firstUserLink).toBeVisible();
    await firstUserLink.click();

    await expectHiddenOrDisabled(page.getByRole('button', { name: 'Delete user' }));
  });
});

test.describe.skipIf(!VIEW_ONLY_FIXTURE_READY)('authorization - ACLs page (view-only role)', () => {
  test('aCLs list is visible but Create ACL is blocked', async ({ page }) => {
    await page.goto('/security/acls', { waitUntil: 'domcontentloaded' });
    expect(page.url()).toContain('/security/acls');

    await expectHiddenOrDisabled(page.getByTestId('create-acls'));

    await page.goto('/security/acls/create', { waitUntil: 'domcontentloaded' });
    await expectDisabledIfShown(page.getByTestId('shared-principal-input'));
  });

  test('deleteACLs dropdown items are hidden in permissions list for view-only', async ({ page, skip }) => {
    await page.goto('/security/permissions-list', { waitUntil: 'domcontentloaded' });

    const firstRow = page.getByRole('row').nth(1);
    const rowExists = await firstRow.isVisible().catch(() => false);
    if (!rowExists) {
      skip();
    }

    await firstRow.getByRole('button').click();

    await Promise.all(
      ['delete-user-and-acls', 'delete-user-only', 'delete-acls-only'].map((testId) =>
        expectHiddenOrDisabled(page.getByTestId(testId))
      )
    );
  });
});

test.describe.skipIf(!VIEW_ONLY_FIXTURE_READY)('authorization - Quotas page (view-only role)', () => {
  test('quotas table loads for view-only role', async ({ page }) => {
    await page.goto('/quotas', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Quotas' })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole('columnheader', { name: 'Type' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
  });
});
