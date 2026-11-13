import { attachScreenshot, test } from './fixtures';
import { mockConnectError, rpcUrl } from '../shared/connect-mock';
import { expect, type Page } from '../shared/e2e';
import { ShadowlinkPage } from '../test-variant-console/utils/shadowlink-page';

const GLOB_PATTERNS = /glob patterns/;
const CONFIGURATION = /configuration/i;

test('preview help opens as a visible nested sheet outside the transformed dialog', async ({
  page,
  errors,
  testInfo,
}) => {
  await page.goto('/topics/bundle-test');
  await page.getByTestId('message-settings-button').click();
  await page.getByTestId('preview-fields-menu-item').click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  await dialog.getByRole('button', { name: GLOB_PATTERNS }).click();
  await attachScreenshot(page, testInfo, 'ui-sdk-nested-sheet.png');
  await expect(page.getByRole('heading', { name: 'Glob Pattern Examples' })).toBeVisible();
  await expect(dialog.locator('[data-slot="sheet-content"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the validated shadow-link connection step advances with SCRAM credentials', async ({
  page,
  errors,
  testInfo,
}) => {
  const shadowlink = new ShadowlinkPage(page, 'http://127.0.0.1:4178');
  await page.goto('/shadowlinks/create');
  await shadowlink.fillConnectionStep({
    name: 'sdk-shadow',
    bootstrapServers: 'redpanda:9092',
    username: 'e2euser',
    password: 'fixture-only-password',
    mechanism: 'SCRAM-SHA-256',
  });
  await attachScreenshot(page, testInfo, 'ui-sdk-shadow-connection.png');
  await expect(page.getByRole('heading', { name: CONFIGURATION })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a security table button rendered as a router link navigates on click', async ({ page, errors }) => {
  await page.goto('/security/users');
  await closeUserConfirmation(page);
  const link = page.getByRole('link', { name: 'sdk-user', exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL('**/security/users/sdk-user/details');
  expect(errors).toEqual([]);
});

async function closeUserConfirmation(page: Page) {
  await page.getByTestId('create-user-button').click();
  await page.getByTestId('create-user-name').fill('another-fixture-user');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByTestId('user-created-successfully')).toBeVisible();
  await page.getByTestId('done-button').click();
  await expect(page.locator('[data-slot="dialog-content"]')).toBeHidden();
}
test('quota failures remain visible alongside SDK live announcers', async ({ page }) => {
  await mockConnectError({
    page,
    urlGlob: rpcUrl('redpanda.api.dataplane.v1.QuotaService', 'ListQuotas'),
    code: 'internal',
    message: 'mocked backend failure',
  });
  await page.goto('/quotas');
  const alert = page.getByRole('alert').filter({ hasText: 'mocked backend failure' });
  await alert.waitFor({ state: 'visible' });
  await expect(alert).toBeVisible();
});
