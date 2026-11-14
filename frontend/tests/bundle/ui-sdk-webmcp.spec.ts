import { attachScreenshot, test as baseTest } from './fixtures';
import { CompressionType } from '../../src/protogen/redpanda/api/console/v1alpha1/common_pb';
import { expect, type Page, type TestArtifacts } from '../shared/e2e';

const test = baseTest.extend({ featureFlags: { enableDarkMode: true } });

type Tool = { name: string; execute: (input: object) => Promise<unknown> };
type TestContext = { tools: Record<string, Tool>; pending?: Promise<unknown> };
type TestDocument = Document & { modelContext: TestContext };

async function installNativeToolHost(page: Page) {
  await page.addInitScript(() => {
    const tools: Record<string, Tool> = {};
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        tools,
        registerTool(tool: Tool, options?: { signal?: AbortSignal }) {
          tools[tool.name] = tool;
          options?.signal?.addEventListener('abort', () => {
            if (tools[tool.name] === tool) {
              delete tools[tool.name];
            }
          });
          return Promise.resolve();
        },
      },
    });
  });
}
async function requestProduceThroughWebMcp(page: Page, testInfo: TestArtifacts) {
  await page.evaluate(() => {
    const host = (document as TestDocument).modelContext;
    host.pending = host.tools.console_act.execute({ steps: [{ ref: 'Produce record', action: 'press', args: [] }] });
  });
  await expect(page.getByRole('dialog', { name: 'Agent action request' })).toBeVisible();
  await expect(page.getByTestId('produce-value-editor')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Agent action request' })).toHaveCSS('opacity', '1');
  await expect(page.getByRole('dialog', { name: 'Agent action request' })).toBeInViewport();
  await attachScreenshot(page, testInfo, 'ui-sdk-agent-approval.png');
  await page.getByRole('button', { name: 'Allow once', exact: true }).click();
  const result = await page.evaluate(() => (document as TestDocument).modelContext.pending);
  expect(result).toMatchObject({ ok: true });
}

async function fillRichEditorThroughWebMcp(page: Page) {
  const surface = page.locator('[data-slot="code-editor"]');
  await expect(surface).toBeVisible();
  await expect(surface).not.toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(() => {
    const host = (document as TestDocument).modelContext;
    host.pending = host.tools.console_act.execute({
      steps: [{ ref: 'code-editor', action: 'setValue', args: ['SDK browser value'] }],
    });
  });
  await expect(page.getByRole('dialog', { name: 'Agent action request' })).toBeVisible();
  await page.getByRole('button', { name: 'Allow once', exact: true }).click();
  expect(await page.evaluate(() => (document as TestDocument).modelContext.pending)).toMatchObject({ ok: true });
  await expect(page.getByTestId('valueData')).toHaveValue('SDK browser value');
  await verifyDraftSafeguards(page);
}

async function fillPrivateDraftFields(page: Page) {
  await page.getByRole('textbox', { name: 'Key data', exact: true }).fill('example-record-key');
  const headers = page.getByRole('group', { name: 'Headers', exact: true });
  await headers.getByRole('button', { name: 'Add row', exact: true }).click();
  await headers.getByRole('textbox').nth(0).fill('Authorization');
  await headers.getByRole('textbox').nth(1).fill('example-header-value');
}
async function denyPublishThroughWebMcp(page: Page) {
  await page.evaluate(async () => {
    const host = (document as TestDocument).modelContext;
    const entries = (await host.tools.console_snapshot.execute({})) as { ref: string; label?: string }[];
    const submit = entries.find((entry) => entry.label === 'Produce');
    if (!submit) {
      throw new Error('Missing produce action');
    }
    host.pending = host.tools.console_act.execute({ steps: [{ ref: submit.ref, action: 'press' }] });
  });
  await expect(page.getByRole('dialog', { name: 'Agent action request' })).toContainText(
    'Draft history cannot undo this request'
  );
  await page
    .getByRole('dialog', { name: 'Agent action request' })
    .getByRole('button', { name: 'Deny', exact: true })
    .click();
  expect(await page.evaluate(() => (document as TestDocument).modelContext.pending)).toMatchObject({ ok: false });
}
async function verifyDraftSafeguards(page: Page) {
  await fillPrivateDraftFields(page);
  const snapshot = JSON.stringify(
    await page.evaluate(() => (document as TestDocument).modelContext.tools.console_snapshot.execute({}))
  );
  expect(snapshot).not.toContain('SDK browser value');
  expect(snapshot).not.toContain('example-record-key');
  expect(snapshot).not.toContain('example-header-value');
  await denyPublishThroughWebMcp(page);
}
async function expectNativeToolCatalog(page: Page) {
  const tools = await page.evaluate(() => Object.keys((document as TestDocument).modelContext.tools).sort());
  expect(tools).toEqual([
    'console_act',
    'console_changes',
    'console_history',
    'console_query',
    'console_snapshot',
    'console_stage',
  ]);
}
async function openEncodingWithKeyboard(page: Page) {
  await page.getByTestId('produce-record-button').click();
  const encoding = page.getByRole('group', { name: 'Value', exact: true }).getByRole('combobox');
  await encoding.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'JSON', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(encoding).toBeFocused();
}

test('production WebMCP discovers controls and cannot open a mutation flow without human approval', async ({
  page,
  errors,
  testInfo,
}) => {
  await installNativeToolHost(page);
  await page.goto('/topics/bundle-test');
  await expect(page.getByTestId('produce-record-button')).toBeVisible();
  await expectNativeToolCatalog(page);
  await requestProduceThroughWebMcp(page, testInfo);
  await fillRichEditorThroughWebMcp(page);
  await attachScreenshot(page, testInfo, 'ui-sdk-produce.png');
  await page.getByRole('link', { name: 'Go Back', exact: true }).click();
  await expect(page.getByTestId('produce-record-button')).toBeVisible();
  expect(errors).toEqual([]);
});

async function expectSelectedColor(page: Page) {
  const colors = await page.getByRole('combobox', { name: 'Compression Type', exact: true }).evaluate((control) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-foreground)';
    control.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return expected;
  });
  await expect(
    page.getByRole('combobox', { name: 'Compression Type', exact: true }).locator('[data-slot="select-value"]')
  ).toHaveCSS('color', colors);
}
async function captureThemes(page: Page, testInfo: TestArtifacts) {
  await expectSelectedColor(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectSelectedColor(page);
  await attachScreenshot(page, testInfo, 'ui-sdk-produce-dark.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await attachScreenshot(page, testInfo, 'ui-sdk-produce-mobile.png');
}

test('production controls keep keyboard navigation and Redpanda layout in both themes', async ({
  page,
  errors,
  testInfo,
}) => {
  await page.addInitScript(() => localStorage.setItem('redpanda-ui-dark-mode', 'true'));
  await page.goto('/topics/bundle-test');
  await openEncodingWithKeyboard(page);
  await captureThemes(page, testInfo);
  expect(errors).toEqual([]);
});

async function openProduceDraft(page: Page) {
  await installNativeToolHost(page);
  await page.goto('/topics/bundle-test');
  await page.getByTestId('produce-record-button').click();
  await expect(page.getByRole('combobox', { name: 'Compression Type', exact: true })).toBeVisible();
}
async function proposeCompression(page: Page) {
  await page.evaluate(async (value) => {
    const host = (document as TestDocument).modelContext;
    const entries = (await host.tools.console_snapshot.execute({})) as { ref: string; label?: string }[];
    const control = entries.find((entry) => entry.label === 'Compression Type');
    if (!control) {
      throw new Error('Compression control missing from Console snapshot');
    }
    host.pending = host.tools.console_stage.execute({ changes: [{ ref: control.ref, value }] });
  }, String(CompressionType.GZIP));
  await page
    .getByRole('dialog', { name: 'Agent action request' })
    .getByRole('button', { name: 'Allow once', exact: true })
    .click();
  const result = await page.evaluate(() => (document as TestDocument).modelContext.pending);
  expect(result).toMatchObject({ applied: 1, requested: 1 });
  await expect(page.getByRole('combobox', { name: 'Compression Type', exact: true })).toHaveText('GZIP');
}
async function seekDraft(page: Page, position: number) {
  await page.evaluate((value) => {
    const host = (document as TestDocument).modelContext;
    host.pending = host.tools.console_history.execute({ command: 'seek', position: value });
  }, position);
  await page
    .getByRole('dialog', { name: 'Agent action request' })
    .getByRole('button', { name: 'Allow once', exact: true })
    .click();
  expect(await page.evaluate(() => (document as TestDocument).modelContext.pending)).toMatchObject({ ok: true });
}
async function reviewAndDiscardPreview(page: Page, testInfo: TestArtifacts) {
  await page.getByRole('button', { name: 'Agent activity', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Agent activity' })).toContainText('1 staged');
  await expect(page.getByRole('dialog', { name: 'Agent activity' })).toHaveCSS('translate', 'none');
  await attachScreenshot(page, testInfo, 'ui-sdk-agent-history.png');
  await page.getByRole('button', { name: 'Discard suggestion', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Agent action request' })
    .getByRole('button', { name: 'Allow once', exact: true })
    .click();
}
test('native draft suggestions can be reviewed and discarded without saving', async ({ page, errors, testInfo }) => {
  await openProduceDraft(page);
  const compression = page.getByRole('combobox', { name: 'Compression Type', exact: true });
  const original = await compression.textContent();
  await proposeCompression(page);
  await reviewAndDiscardPreview(page, testInfo);
  await expect(compression).toHaveText(original ?? '');
  expect(errors).toEqual([]);
});
async function chooseHumanCompression(page: Page) {
  const compression = page.getByRole('combobox', { name: 'Compression Type', exact: true });
  if ((await compression.getAttribute('aria-expanded')) !== 'true') {
    await compression.click();
  }
  await page.getByRole('option', { name: 'LZ4', exact: true }).click();
}
async function undoAgentDraft(page: Page) {
  await page.evaluate(() => {
    const host = (document as TestDocument).modelContext;
    host.pending = host.tools.console_history.execute({ command: 'undo-agent' });
  });
  await page
    .getByRole('dialog', { name: 'Agent action request' })
    .getByRole('button', { name: 'Allow once', exact: true })
    .click();
  expect(await page.evaluate(() => (document as TestDocument).modelContext.pending)).toMatchObject({ ok: true });
}
test('native draft history seeks both ways and undoSource preserves newer human choices', async ({ page, errors }) => {
  await openProduceDraft(page);
  await proposeCompression(page);
  await seekDraft(page, 0);
  await seekDraft(page, 1);
  await chooseHumanCompression(page);
  await undoAgentDraft(page);
  await expect(page.getByRole('combobox', { name: 'Compression Type', exact: true })).toHaveText('LZ4');
  expect(errors).toEqual([]);
});
