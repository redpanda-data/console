import { test } from './fixtures';
import { expect, type Locator, type Page } from '../shared/e2e';

// The page reads through both the console and dataplane SecurityService.
const SECURITY_SERVICE = '**/*.SecurityService/';
const ROLE_NAME = 'analytics-writer';

async function rejectRoleCreate(page: Page) {
  await page.route(`${SECURITY_SERVICE}ListRoles`, (route) => route.fulfill({ json: {} }));
  await page.route(`${SECURITY_SERVICE}CreateRole`, (route) =>
    route.fulfill({ status: 400, json: { code: 'invalid_argument', message: 'role name rejected' } })
  );
}

async function submitCreateRole(page: Page) {
  await page.goto('/security/roles');
  await page.getByRole('button', { name: 'Create role' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Create role', exact: true });
  await dialog.getByLabel('Role name').fill(ROLE_NAME);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  return dialog;
}

// index.scss lifts Console's toast viewport above modal backdrops, which the registry stacks at the same z-index.
async function dismissErrorToast(page: Page) {
  const toasts = page.getByTestId('console-toasts');
  await expect(toasts.getByText('Failed to create role: role name rejected')).toBeVisible();
  await page.keyboard.press('F6');
  await expect(toasts).toBeFocused();
  // Playwright refuses the click if the dialog backdrop is the hit target.
  await toasts.locator('[data-slot="toast-close"]').click();
  await expect(toasts.locator('[data-slot="toast"]')).toHaveCount(0);
}

async function expectDialogKept(dialog: Locator) {
  await expect(dialog.getByLabel('Role name')).toHaveValue(ROLE_NAME);
}

test('a rejected create keeps the dialog open under one reachable error toast', async ({ page }) => {
  await rejectRoleCreate(page);
  const dialog = await submitCreateRole(page);
  await dismissErrorToast(page);
  await expectDialogKept(dialog);
});
