import { measure, test, trackScripts } from './fixtures';
import { writeFile } from 'node:fs/promises';
import { expect } from '../shared/e2e';

for (const [route, heading] of [
  ['/overview', 'Overview'],
  ['/topics', 'Topics'],
  ['/topics/bundle-test', 'bundle-test'],
] as const) {
  test(`cold ${route} does not download Monaco`, async ({ page, errors, testInfo }) => {
    const scripts = trackScripts(page);
    await page.goto(route);
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
      await expect(page.getByRole('tab', { name: 'Messages', exact: true })).toBeVisible();
    }
    await page.waitForLoadState('networkidle');
    const sizes = await measure(scripts);
    await writeFile(testInfo.outputPath('cold-assets.json'), JSON.stringify(sizes, null, 2));
    await testInfo.attach('cold-assets.json', {
      path: testInfo.outputPath('cold-assets.json'),
      contentType: 'application/json',
    });
    await page.screenshot({ path: testInfo.outputPath('route.png') });
    await testInfo.attach('route.png', { path: testInfo.outputPath('route.png'), contentType: 'image/png' });
    expect(errors).toEqual([]);
    expect([...scripts].filter((path) => path.includes('monaco'))).toEqual([]);
    expect(sizes.totals.raw).toBeLessThan(4_700_000);
  });
}

test('Documentation downloads its renderer only when selected', async ({ page, errors, testInfo }) => {
  const scripts = trackScripts(page);
  await page.goto('/topics/bundle-test');
  await expect(page.getByRole('tab', { name: 'Messages', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.waitForLoadState('networkidle');
  const before = new Set(scripts);
  await page.getByRole('tab', { name: 'Documentation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bundle documentation' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'x', exact: true })).toBeVisible();
  await expect(page.getByText('Hello 😄')).toBeVisible();
  await expect(page.getByRole('link', { name: 'unsafe', exact: true })).toHaveAttribute('href', '');
  await expect(page.locator('.topicDocumentation pre')).toHaveText('{"hello":"world"}');
  await page.waitForLoadState('networkidle');
  const deferred = await measure([...scripts].filter((path) => !before.has(path)));
  await writeFile(testInfo.outputPath('documentation-assets.json'), JSON.stringify(deferred, null, 2));
  await testInfo.attach('documentation-assets.json', {
    path: testInfo.outputPath('documentation-assets.json'),
    contentType: 'application/json',
  });
  expect(errors).toEqual([]);
  await expect(page.getByRole('tab', { name: 'Documentation', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Fetching data...', { exact: true })).toBeHidden();
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished)
    )
  );
  await page.screenshot({ path: testInfo.outputPath('documentation.png') });
  await testInfo.attach('documentation.png', {
    path: testInfo.outputPath('documentation.png'),
    contentType: 'image/png',
  });
  expect(deferred.totals.raw).toBeGreaterThan(750_000);
  const loaded = scripts.size;
  await page.getByRole('tab', { name: 'Messages', exact: true }).click();
  await page.getByRole('tab', { name: 'Documentation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bundle documentation' })).toBeVisible();
  expect(scripts.size).toBe(loaded);
});

test('Produce Record mounts the local editor and JSON worker on demand', async ({ page, errors, testInfo }) => {
  const scripts = trackScripts(page);
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto('/topics/bundle-test');
  await page.getByTestId('produce-record-button').click();
  await page.getByRole('group', { name: 'Value', exact: true }).getByRole('combobox').click();
  await page.getByRole('option', { name: 'JSON', exact: true }).click();
  const editor = page.getByTestId('produce-value-editor').locator('.monaco-editor');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click({ position: { x: 150, y: 40 } });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('{"bundle":true}');
  await expect(page.getByTestId('produce-value-editor')).toContainText('"bundle"');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('{"bundle":}');
  await expect(editor.locator('.squiggly-error').first()).toBeVisible();
  expect(workers.length).toBeGreaterThan(0);
  expect(workers.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await testInfo.attach('workers.json', { body: JSON.stringify(workers), contentType: 'application/json' });
  expect([...scripts].some((path) => path.includes('monaco'))).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('producer.png') });
  await testInfo.attach('producer.png', { path: testInfo.outputPath('producer.png'), contentType: 'image/png' });
});

test('Documentation direct links load without Messages or an editor', async ({ page, errors }) => {
  const scripts = trackScripts(page);
  await page.goto('/topics/bundle-test#documentation');
  await expect(page.getByRole('tab', { name: 'Documentation', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Bundle documentation' })).toBeVisible();
  expect([...scripts].filter((path) => path.includes('monaco'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('a rejected Documentation chunk keeps Messages available and reload recovers', async ({ page, testInfo }) => {
  await page.goto('/topics/bundle-test');
  await expect(page.getByRole('tab', { name: 'Messages', exact: true })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.route('**/static/js/async/*.js', (route) => route.abort());
  await page.getByRole('tab', { name: 'Documentation', exact: true }).click();
  await expect(page.getByText('Unable to load documentation. Reload the page to try again.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('documentation-error.png') });
  await testInfo.attach('documentation-error.png', {
    path: testInfo.outputPath('documentation-error.png'),
    contentType: 'image/png',
  });
  await page.getByRole('tab', { name: 'Messages', exact: true }).click();
  await expect(page.getByTestId('produce-record-button')).toBeVisible();
  await page.getByRole('tab', { name: 'Documentation', exact: true }).click();
  await page.unroute('**/static/js/async/*.js');
  await page.getByRole('button', { name: 'Reload page', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bundle documentation' })).toBeVisible();
});

test('the pipeline YAML editor loads local validation on demand', async ({ page, errors, testInfo }) => {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  await page.goto('/rp-connect/create');
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click({ position: { x: 150, y: 40 } });
  await page.keyboard.insertText('input: ]');
  await expect(editor.locator('.squiggly-error').first()).toBeVisible();
  expect(workers.length).toBeGreaterThan(0);
  expect(workers.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('yaml.png') });
  await testInfo.attach('yaml.png', { path: testInfo.outputPath('yaml.png'), contentType: 'image/png' });
});
