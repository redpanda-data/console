import { attachJson, attachScreenshot, measure, test, trackScripts, trackWorkers } from './fixtures';
import { expect, type Locator, type Page, type TestArtifacts } from '../shared/e2e';

const ASYNC_CHUNKS = '**/static/js/async/*.js';

function tab(page: Page, name: string) {
  return page.getByRole('tab', { name, exact: true });
}

function monacoScripts(scripts: Iterable<string>) {
  return [...scripts].filter((path) => path.includes('monaco'));
}

function expectSameOriginWorkers(page: Page, workers: string[]) {
  expect(workers.length).toBeGreaterThan(0);
  expect(workers.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
}

async function expectColdRouteRendered(page: Page, route: string, heading: string) {
  await expect(page.getByRole('link', { name: 'Topics', exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByRole('heading', {
        name: heading,
        exact: true,
      })
      .first()
  ).toBeVisible();
  if (route === '/topics/bundle-test') {
    await expect(tab(page, 'Messages')).toBeVisible();
  }
}

// Opens the topic on its default Messages tab and returns the scripts loaded so far.
async function openTopicMessages(page: Page, scripts: Set<string>) {
  await page.goto('/topics/bundle-test');
  await expect(tab(page, 'Messages')).toHaveAttribute('aria-selected', 'true');
  await page.waitForLoadState('networkidle');
  return new Set(scripts);
}

async function selectDocumentation(page: Page) {
  await tab(page, 'Documentation').click();
  await expect(page.getByRole('heading', { name: 'Bundle documentation' })).toBeVisible();
}

async function expectRenderedMarkdown(page: Page) {
  await expect(page.getByRole('cell', { name: 'x', exact: true })).toBeVisible();
  await expect(page.getByText('Hello 😄')).toBeVisible();
  await expect(page.getByRole('link', { name: 'unsafe', exact: true })).toHaveAttribute('href', '');
  await expect(page.locator('.topicDocumentation pre')).toHaveText('{"hello":"world"}');
}

async function measureScriptsLoadedSince(page: Page, scripts: Set<string>, before: Set<string>) {
  await page.waitForLoadState('networkidle');
  return measure([...scripts].filter((path) => !before.has(path)));
}

async function waitForFiniteAnimations(page: Page) {
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished)
    )
  );
}

async function captureSettledDocumentation(page: Page, testInfo: TestArtifacts) {
  await expect(tab(page, 'Documentation')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Fetching data...', { exact: true })).toBeHidden();
  await waitForFiniteAnimations(page);
  await attachScreenshot(page, testInfo, 'documentation.png');
}

async function expectDocumentationRevisitLoadsNoScripts(page: Page, scripts: Set<string>) {
  const loaded = scripts.size;
  await tab(page, 'Messages').click();
  await selectDocumentation(page);
  expect(scripts.size).toBe(loaded);
}

async function openProduceJsonEditor(page: Page) {
  await page.goto('/topics/bundle-test');
  await page.getByTestId('produce-record-button').click();
  await page.getByRole('group', { name: 'Value', exact: true }).getByRole('combobox').click();
  await page.getByRole('option', { name: 'JSON', exact: true }).click();
  const editor = page.getByTestId('produce-value-editor').locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  return editor;
}

async function expectJsonValidationWhileTyping(page: Page, editor: Locator) {
  await editor.click({ position: { x: 150, y: 40 } });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('{"bundle":true}');
  await expect(page.getByTestId('produce-value-editor')).toContainText('"bundle"');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('{"bundle":}');
  await expect(editor.locator('.squiggly-error').first()).toBeVisible();
}

async function expectDocumentationChunkFailure(page: Page) {
  await page.route(ASYNC_CHUNKS, (route) => route.abort());
  await tab(page, 'Documentation').click();
  await expect(page.getByText('Unable to load documentation. Reload the page to try again.')).toBeVisible();
}

async function recoverDocumentationByReloading(page: Page) {
  await tab(page, 'Documentation').click();
  await page.unroute(ASYNC_CHUNKS);
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bundle documentation' })).toBeVisible();
}

for (const [route, heading] of [
  ['/overview', 'Overview'],
  ['/topics', 'Topics'],
  ['/topics/bundle-test', 'bundle-test'],
] as const) {
  test(`cold ${route} does not download Monaco`, async ({ page, errors, testInfo }) => {
    const scripts = trackScripts(page);
    await page.goto(route);
    await expectColdRouteRendered(page, route, heading);
    await page.waitForLoadState('networkidle');
    const sizes = await measure(scripts);
    await attachJson(testInfo, 'cold-assets.json', sizes);
    await attachScreenshot(page, testInfo, 'route.png');
    expect(errors).toEqual([]);
    expect(monacoScripts(scripts)).toEqual([]);
    expect(sizes.totals.raw).toBeLessThan(4_700_000);
  });
}

test('documentation downloads its renderer only when selected', async ({ page, errors, testInfo }) => {
  const scripts = trackScripts(page);
  const before = await openTopicMessages(page, scripts);
  await selectDocumentation(page);
  await expectRenderedMarkdown(page);
  const deferred = await measureScriptsLoadedSince(page, scripts, before);
  await attachJson(testInfo, 'documentation-assets.json', deferred);
  expect(errors).toEqual([]);
  await captureSettledDocumentation(page, testInfo);
  expect(deferred.totals.raw).toBeGreaterThan(750_000);
  await expectDocumentationRevisitLoadsNoScripts(page, scripts);
});

test('produce Record mounts the local editor and JSON worker on demand', async ({ page, errors, testInfo }) => {
  const scripts = trackScripts(page);
  const workers = trackWorkers(page);
  const editor = await openProduceJsonEditor(page);
  await expectJsonValidationWhileTyping(page, editor);
  expectSameOriginWorkers(page, workers);
  await testInfo.attach('workers.json', { body: JSON.stringify(workers), contentType: 'application/json' });
  expect([...scripts].some((path) => path.includes('monaco'))).toBe(true);
  expect(errors).toEqual([]);
  await attachScreenshot(page, testInfo, 'producer.png');
});

test('documentation direct links load without Messages or an editor', async ({ page, errors }) => {
  const scripts = trackScripts(page);
  await page.goto('/topics/bundle-test#documentation');
  await expect(tab(page, 'Documentation')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Bundle documentation' })).toBeVisible();
  expect(monacoScripts(scripts)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a rejected Documentation chunk keeps Messages available and reload recovers', async ({ page, testInfo }) => {
  await page.goto('/topics/bundle-test');
  await expect(tab(page, 'Messages')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expectDocumentationChunkFailure(page);
  await attachScreenshot(page, testInfo, 'documentation-error.png');
  await tab(page, 'Messages').click();
  await expect(page.getByTestId('produce-record-button')).toBeVisible();
  await recoverDocumentationByReloading(page);
});

test('the pipeline YAML editor loads local validation on demand', async ({ page, errors, testInfo }) => {
  const workers = trackWorkers(page);
  await page.goto('/rp-connect/create');
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click({ position: { x: 150, y: 40 } });
  await page.keyboard.insertText('input: ]');
  await expect(editor.locator('.squiggly-error').first()).toBeVisible();
  expectSameOriginWorkers(page, workers);
  expect(errors).toEqual([]);
  await attachScreenshot(page, testInfo, 'yaml.png');
});
