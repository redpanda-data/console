// spec: specs/security.md

import { expect, test } from '@playwright/test';

const PRINCIPAL_HEADER = /^Principal$/;
const HOST_HEADER = /^Host$/;
const SORT_ASC = /Asc/;

// The ACLs tab is the last security surface still on the old design, and it had no spec of its
// own — only an enterprise authorization test navigates here. What the Registry swap risked is
// the filter field and the table: Chakra painted a sort affordance on every header, while the
// Registry sorts only through `DataTableColumnHeader`, so a swap can leave sorting unreachable
// with nothing failing. A fresh cluster has no ACLs, so this asserts the chrome, not rows.
test.describe('Security ACLs tab', () => {
  test('renders the filter, the table and reachable sorting', async ({ page }) => {
    await page.goto('/security/acls');

    await expect(page.getByTestId('create-acls')).toBeVisible();
    await expect(page.getByPlaceholder('Filter by name')).toBeVisible();

    // Both sortable columns must expose a trigger; the action column must not.
    const table = page.getByRole('table');
    await expect(table.getByRole('button', { name: PRINCIPAL_HEADER })).toBeVisible();
    await expect(table.getByRole('button', { name: HOST_HEADER })).toBeVisible();

    // `DataTableColumnHeader` is a dropdown trigger, so the header opens a menu rather than
    // sorting on a single click.
    await table.getByRole('button', { name: PRINCIPAL_HEADER }).click();
    await expect(page.getByRole('menuitem', { name: SORT_ASC })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
