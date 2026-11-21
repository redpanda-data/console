import { attachScreenshot, test as baseTest } from './fixtures';
import { rpcUrl } from '../shared/connect-mock';
import { expect, type Page, type Route } from '../shared/e2e';

const test = baseTest.extend({ featureFlags: { enableRpcnTemplateGallery: true } });
const EXPECTED_UNAVAILABLE = 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)';

async function openTopicSearch(page: Page) {
  await page.route(rpcUrl('redpanda.api.dataplane.v1.PipelineService', 'GetPipelineServiceConfigSchema'), (route) =>
    route.fulfill({ json: {} })
  );
  await page.goto('/rp-connect/create');
  await page.getByTestId('template-gallery-cta').click();
  await page.getByTestId('template-tile-s3-to-redpanda').click();
  await page.getByRole('combobox', { name: 'Target Redpanda topic', exact: true }).click();
  return page.getByPlaceholder('Search topics (case-sensitive)...');
}

test('template topic search recovers from a transport error and selects the result', async ({
  page,
  errors,
  testInfo,
}) => {
  let failNextSearch = true;
  await page.route(rpcUrl('redpanda.api.dataplane.v1.TopicService', 'ListTopics'), async (route) => {
    const request = route.request().postDataJSON() as { filter?: { nameContains?: string } };
    if (request.filter?.nameContains === 'orders' && failNextSearch) {
      failNextSearch = false;
      await route.fulfill({ status: 503, json: { code: 'unavailable', message: 'Fixture search unavailable' } });
      return;
    }
    await route.fulfill({ json: { topics: request.filter?.nameContains ? [{ name: 'orders.recovered' }] : [] } });
  });
  const search = await openTopicSearch(page);
  await search.pressSequentially('orders');
  await expect(
    page.locator('[data-console-agent-root]').getByRole('status').filter({ hasText: 'Could not load topics.' })
  ).toBeVisible();
  await attachScreenshot(page, testInfo, 'ui-sdk-async-search-retry.png');
  await page.getByRole('button', { name: 'Retry topic search' }).click();
  await page.getByRole('option', { name: 'orders.recovered', exact: true }).click();
  await expect(page.getByTestId('slot-targetTopic')).toContainText('orders.recovered');
  expect(errors.filter((message) => message !== EXPECTED_UNAVAILABLE)).toEqual([]);
});

async function holdOlderSearch(page: Page) {
  const held = Promise.withResolvers<Route>();
  await page.route(rpcUrl('redpanda.api.dataplane.v1.TopicService', 'ListTopics'), async (route) => {
    const request = route.request().postDataJSON() as { filter?: { nameContains?: string } };
    if (request.filter?.nameContains === 'older') {
      held.resolve(route);
      return;
    }
    await route.fulfill({ json: { topics: request.filter?.nameContains ? [{ name: 'newer.topic' }] : [] } });
  });
  return held;
}

async function startOlderSearch(page: Page) {
  const held = await holdOlderSearch(page);
  const search = await openTopicSearch(page);
  await search.fill('older');
  return { route: await held.promise, search };
}

test('new topic searches cancel the old browser request without repainting stale options', async ({ page, errors }) => {
  const { route, search } = await startOlderSearch(page);
  const aborted = page.waitForEvent('requestfailed', { predicate: (request) => request === route.request() });
  try {
    await search.fill('newer');
    await expect(page.getByRole('option', { name: 'newer.topic', exact: true })).toBeVisible();
  } finally {
    await route.fulfill({ json: { topics: [{ name: 'older.topic' }] } });
  }
  await aborted;
  await expect(page.getByRole('option', { name: 'older.topic', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
