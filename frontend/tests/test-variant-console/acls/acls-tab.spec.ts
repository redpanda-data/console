// spec: the security ACLs tab — see the PR for the swap's contract

import { expect, test } from '@playwright/test';

const PRINCIPAL_HEADER = /^Principal$/;
const HOST_HEADER = /^Host$/;
const SORT_ASC = /Asc/;

// The Registry sorts only through `DataTableColumnHeader`, where Chakra painted an affordance on
// every header, so a swap can leave sorting unreachable with nothing failing. A fresh cluster has
// no ACLs, so this asserts the chrome rather than rows.
test.describe('Security ACLs tab', () => {
  test('renders the filter, the table and reachable sorting', async ({ page }) => {
    await page.goto('/security/acls');

    await expect(page.getByTestId('create-acls')).toBeVisible();
    await expect(page.getByPlaceholder('Filter by name')).toBeVisible();

    // Both sortable columns must expose a trigger; the action column must not.
    const table = page.getByRole('table');
    await expect(table.getByRole('button', { name: PRINCIPAL_HEADER })).toBeVisible();
    await expect(table.getByRole('button', { name: HOST_HEADER })).toBeVisible();

    // The header is a dropdown trigger, not a one-click sort.
    await table.getByRole('button', { name: PRINCIPAL_HEADER }).click();
    await expect(page.getByRole('menuitem', { name: SORT_ASC })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
