// WARNING: Open details with a cold cache; app navigation can hide a broken bookmark by warming the Connect query first.

import { expect, type Page, test } from '../../shared/e2e';

const ACLS_HEADING_NAME = /ACLs/u;
const CACHE_MISS_ERROR_PATTERN = /cannot read|undefined|missing user/iu;

const openAddAclDialog = async (page: Page) => {
  await page.goto('/security/permissions', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create ACL' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Add ACL' })).toBeVisible();
};

const seedTopicReadAcl = async (page: Page, principal: string, topicName: string) => {
  await openAddAclDialog(page);

  await page.getByPlaceholder('Select or type a user...').fill(principal);
  await page.getByRole('option', { name: `Create "${principal}"` }).click();
  await page.getByPlaceholder('e.g. my-topic').fill(topicName);

  await page.getByLabel('Operation').click();
  await page.getByRole('option', { name: 'Read', exact: true }).click();

  await page.getByRole('button', { name: 'Add ACL' }).click();
  await expect(page.getByRole('dialog', { name: 'Add ACL' })).not.toBeVisible({ timeout: 10_000 });
};

const expectDeepLinkedAclDetails = async (freshPage: Page, principal: string, topicName: string) => {
  await freshPage.goto(`/security/acls/User:${principal}/details`, { waitUntil: 'domcontentloaded' });

  await expect(freshPage.getByTestId('acl-rules-length').first()).toHaveText('ACL rules (1)', {
    timeout: 15_000,
  });
  await expect(freshPage.getByText(`Topics matching: "${topicName}"`)).toBeVisible();
  await expect(freshPage.getByText('Read: allow')).toBeVisible();
};

test.describe('security pages deep-link (cold cache)', () => {
  test('direct-load /security/users/e2euser/details renders without prior list navigation', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/security/users/e2euser/details', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Principal:User:e2euser')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: ACLS_HEADING_NAME })).toBeVisible();

    const suspicious = consoleErrors.filter((msg) => CACHE_MISS_ERROR_PATTERN.test(msg));
    expect(suspicious).toEqual([]);
  });

  test('direct-load /security/acls/<principal>/details renders for existing principal', async ({
    page,
    browser,
    playwright,
  }) => {
    const principal = `deeplink-${crypto.randomUUID()}`;
    const topicName = 'deeplink-topic';

    await seedTopicReadAcl(page, principal, topicName);

    const freshContext = await browser.newContext(playwright.contextOptions);
    const freshPage = await freshContext.newPage();
    try {
      await expectDeepLinkedAclDetails(freshPage, principal, topicName);
    } finally {
      await freshContext.close();
    }
  });
});
