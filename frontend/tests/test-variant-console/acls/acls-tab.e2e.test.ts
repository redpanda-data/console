// spec: the security ACLs tab — see the PR for the swap's contract

import { expect, test } from '../../shared/e2e';

const PRINCIPAL_HEADER = /^Principal$/u;
const HOST_HEADER = /^Host$/u;
const SORT_ASC = /Asc/u;

test.describe('security ACLs tab', () => {
  test('renders the filter, the table and reachable sorting', async ({ page }) => {
    await page.goto('/security/acls');

    await expect(page.getByTestId('create-acls')).toBeVisible();
    await expect(page.getByPlaceholder('Filter by name')).toBeVisible();

    const table = page.getByRole('table');
    await expect(table.getByRole('button', { name: PRINCIPAL_HEADER })).toBeVisible();
    await expect(table.getByRole('button', { name: HOST_HEADER })).toBeVisible();

    await table.getByRole('button', { name: PRINCIPAL_HEADER }).click();
    await expect(page.getByRole('menuitem', { name: SORT_ASC })).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
