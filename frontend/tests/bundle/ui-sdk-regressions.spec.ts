import { attachScreenshot, test } from './fixtures';
import { ShadowLinkState, ShadowTopicState } from '../../src/protogen/redpanda/core/admin/v2/shadow_link_pb';
import { mockConnectError, rpcUrl } from '../shared/connect-mock';
import { expect, type Locator, type Page } from '../shared/e2e';
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
  const dialog = page.getByRole('dialog', { name: 'Preview fields', exact: true });
  await dialog.getByRole('button', { name: GLOB_PATTERNS }).click();
  await attachScreenshot(page, testInfo, 'ui-sdk-nested-sheet.png');
  await expect(page.getByRole('heading', { name: 'Glob Pattern Examples' })).toBeVisible();
  await expectPatternSheet(page, dialog);
  expect(errors).toEqual([]);
});

async function expectPatternSheet(page: Page, parent: Locator) {
  await expect(page.getByRole('dialog', { name: 'Glob Pattern Examples', exact: true })).toBeInViewport();
  await expect(parent.getByRole('dialog', { name: 'Glob Pattern Examples', exact: true })).toHaveCount(0);
}

async function openMobileReadScope(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__E2E_FEATURE_FLAGS__ = { enableNewTopicMessagesPage: true };
  });
  await page.goto('/topics/bundle-test');
  await page.getByTestId('read-scope-button').click();
  await page.getByTestId('read-scope-docs-button').click();
  return page.getByRole('dialog', { name: 'How reading starts' });
}

const topOfDrawer = (drawer: Locator) => drawer.evaluate((element) => element.getBoundingClientRect().top);
const isDocumentScrollLocked = (page: Page) =>
  page.evaluate(() =>
    [document.documentElement, document.body].some((element) => element.style.overflowY === 'hidden')
  );

test('mobile read-scope help snaps taller without unlocking the page underneath', async ({ page, errors }) => {
  const drawer = await openMobileReadScope(page);
  await expect.poll(() => topOfDrawer(drawer)).toBeGreaterThan(300);
  await expect.poll(() => isDocumentScrollLocked(page)).toBe(true);
  await drawer.getByRole('button', { name: 'Expand', exact: true }).press('Enter');
  await expect.poll(() => topOfDrawer(drawer)).toBeLessThan(200);
  await expect.poll(() => isDocumentScrollLocked(page)).toBe(true);
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect.poll(() => isDocumentScrollLocked(page)).toBe(false);
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

test('a plain SDK router link in the security table navigates after confirmation closes', async ({ page, errors }) => {
  await page.goto('/security/users');
  await closeUserConfirmation(page);
  const link = page.getByRole('link', { name: 'sdk-user', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/security/users/sdk-user/details');
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

const SHADOW_SERVICE = 'redpanda.api.dataplane.v1.ShadowLinkService';
async function mockShadowFailover(page: Page) {
  const requests: object[] = [];
  await page.route(rpcUrl(SHADOW_SERVICE, 'GetShadowLink'), (route) =>
    route.fulfill({ json: { shadowLink: { name: 'sdk-shadow', state: ShadowLinkState.ACTIVE } } })
  );
  await page.route(rpcUrl(SHADOW_SERVICE, 'GetShadowMetrics'), (route) => route.fulfill({ json: {} }));
  await page.route(rpcUrl(SHADOW_SERVICE, 'ListShadowLinkTopics'), (route) =>
    route.fulfill({
      json: {
        shadowTopics: [
          {
            topicName: 'owlshop-orders',
            state: requests.length ? ShadowTopicState.FAILED_OVER : ShadowTopicState.ACTIVE,
          },
        ],
      },
    })
  );
  await page.route(rpcUrl(SHADOW_SERVICE, 'FailOver'), (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });
  return requests;
}

test('shadow-link confirmation sends the selected topic and whole-link failover RPCs', async ({ page, errors }) => {
  const requests = await mockShadowFailover(page);
  const shadowlink = new ShadowlinkPage(page, 'http://127.0.0.1:4178');
  await page.goto('/shadowlinks/sdk-shadow');
  await shadowlink.failoverTopic('owlshop-orders');
  expect(requests).toEqual([{ name: 'sdk-shadow', shadowTopicName: 'owlshop-orders' }]);
  await shadowlink.performFailover();
  expect(requests).toEqual([{ name: 'sdk-shadow', shadowTopicName: 'owlshop-orders' }, { name: 'sdk-shadow' }]);
  expect(errors).toEqual([]);
});
