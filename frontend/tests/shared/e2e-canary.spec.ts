import { appURL, type BrowserContext, expect, type Page, type TestArtifacts, test } from './e2e';
import { QuotaPage } from '../test-variant-console/utils/quota-page';

// Records whether keyboard and drop events are trusted (native) rather than synthetic.
const installNativeEventProbes = (page: Page) =>
  page.evaluate(() => {
    const target = document.querySelector('#target');
    target?.addEventListener('dragover', (event) => event.preventDefault());
    target?.addEventListener('drop', (event) => {
      target.textContent = event.isTrusted ? 'Trusted drop' : 'Synthetic drop';
    });
    document.addEventListener('keydown', (event) => {
      document.body.dataset.key = `${event.isTrusted}:${event.shiftKey}`;
    });
  });

const expectNativeShiftedKey = async (page: Page) => {
  const input = page.getByRole('textbox', { name: 'Text' });
  await input.click();
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Shift');
  await expect(input).toHaveValue('A');
  expect(await page.locator('body').getAttribute('data-key')).toBe('true:true');
};

const expectNativeDragAndDrop = async (page: Page) => {
  await page.locator('#source').dragTo(page.locator('#target'));
  await expect(page.locator('#target')).toHaveText('Trusted drop');
};

const expectRuntimeViewportChange = async (page: Page) => {
  expect(await page.evaluate(() => innerWidth)).toBe(640);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => innerWidth)).toBe(390);
};

const expectNewPageInSameContext = async (context: BrowserContext) => {
  const second = await context.newPage();
  await second.setContent('<h1>Same context, new page</h1>');
  await expect(second.getByRole('heading')).toHaveText('Same context, new page');
  await second.close();
};

const attachScreenshot = async (page: Page, testInfo: TestArtifacts) => {
  await page.screenshot({ path: testInfo.outputPath('native-input.png') });
  await testInfo.attach('native-input.png', {
    path: testInfo.outputPath('native-input.png'),
    contentType: 'image/png',
  });
};

test('keeps native keys, drag, runtime viewport, DOM access and isolated contexts', async ({
  page,
  context,
  featureFlags,
  testInfo,
}) => {
  expect(featureFlags).toEqual({});
  expect(page.viewportSize()).toEqual({ width: 1280, height: 720 });
  await page.setViewportSize({ width: 640, height: 480 });
  await page.setContent(
    '<input aria-label="Text"><div draggable="true" id="source">Drag</div><div id="target">Drop</div>'
  );
  await installNativeEventProbes(page);
  await expectNativeShiftedKey(page);
  await expectNativeDragAndDrop(page);
  await expectRuntimeViewportChange(page);
  await expectNewPageInSameContext(context);
  await attachScreenshot(page, testInfo);
});

const flaggedTest = test.extend({ featureFlags: { TEST_BOOT_FLAG: true } });
flaggedTest(
  'sets feature flags before application scripts and retains artifact metadata',
  async ({ page, testInfo, task }) => {
    await page.goto('data:text/html,<script>window.bootFlag=window.__E2E_FEATURE_FLAGS__.TEST_BOOT_FLAG</script>');
    expect(await page.evaluate(() => Reflect.get(window, 'bootFlag'))).toBe(true);
    await testInfo.attach('boot.json', { body: '{"ready":true}', contentType: 'application/json' });
    expect(task.meta.attachments).toEqual([
      { name: 'boot.json', path: testInfo.outputPath('boot.json'), contentType: 'application/json' },
    ]);
  }
);

const openQuotasPage = async (context: BrowserContext) => {
  await context.route('http://quota-canary.test/quotas', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Quotas</h1>' })
  );
  return context.newPage();
};

test('quota navigation honors baseURL before the first page navigation', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://quota-canary.test' });
  try {
    const page = await openQuotasPage(context);
    const quotas = new QuotaPage(page);
    await quotas.goToQuotasList();
    expect(page.url()).toBe('http://quota-canary.test/quotas');
    await page.goto('about:blank');
    await quotas.reloadPage();
    expect(page.url()).toBe('http://quota-canary.test/quotas');
  } finally {
    await context.close();
  }
});

test('uRL assertions retain the configured origin and exact path/query', async ({ browser, playwright }) => {
  const context = await browser.newContext(playwright.contextOptions);
  try {
    await context.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>URL canary</h1>' }));
    const page = await context.newPage();
    await page.goto('/quotas?page=1');
    await expect(page).toHaveURL(appURL('/quotas?page=1'), { timeout: 50 });
    await expect(page).not.toHaveURL(appURL('/quotas?page=2'), { timeout: 50 });
    await page.goto('http://wrong-origin.test/quotas?page=1');
    await expect(expect(page).toHaveURL(appURL('/quotas?page=1'), { timeout: 50 })).rejects.toThrow('Expected page');
  } finally {
    await context.close();
  }
});
