import { test } from './fixtures';
import { type BrowserContext, expect, type Locator, type Page, type TestArtifacts } from '../shared/e2e';

const VALID_YAML = 'input:\n  generate:\n    mapping: root = this\n    interval: 1s';
const INTERVAL_HELP = 'The interval at which messages should be generated.';

const GENERATE_INPUT = {
  name: 'generate',
  type: 'input',
  summary: 'Generates messages at a regular interval.',
  config: {
    type: 'object',
    children: [{ name: 'interval', type: 'string', kind: 'scalar', description: INTERVAL_HELP }],
  },
};

async function pasteYaml(page: Page, yaml: string) {
  await page.evaluate((text) => navigator.clipboard.writeText(text), yaml);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}

async function openPipelineEditor(context: BrowserContext, page: Page) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/*.PipelineService/ListComponents', (route) =>
    route.fulfill({ json: { components: { inputs: [GENERATE_INPUT] } } })
  );
  await page.goto('/rp-connect/create');
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  await editor.click({ position: { x: 150, y: 40 } });
  return editor;
}

async function expectIntervalHelpOnHover(page: Page, editor: Locator) {
  await editor.getByText('interval', { exact: true }).hover();
  await expect(page.getByText(INTERVAL_HELP, { exact: true })).toBeVisible();
}

async function attachFullPageScreenshot(page: Page, testInfo: TestArtifacts, name: string) {
  await page.screenshot({ path: testInfo.outputPath(name), animations: 'disabled', fullPage: true });
  await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' });
}

async function expectSyntaxValidationRecovers(page: Page, editor: Locator) {
  await page.keyboard.press('Escape');
  await pasteYaml(page, 'input: ]');
  await expect(editor.locator('.squiggly-error').first()).toBeVisible();
  await pasteYaml(page, VALID_YAML);
  await expect(editor.locator('.squiggly-error')).toHaveCount(0);
}

test('pipeline YAML exposes field documentation and preserves syntax validation', async ({
  context,
  page,
  errors,
  testInfo,
}) => {
  const editor = await openPipelineEditor(context, page);
  await pasteYaml(page, VALID_YAML);
  await expectIntervalHelpOnHover(page, editor);
  await attachFullPageScreenshot(page, testInfo, 'yaml-field-help.png');

  await expectSyntaxValidationRecovers(page, editor);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectIntervalHelpOnHover(page, editor);
  await attachFullPageScreenshot(page, testInfo, 'yaml-field-help-mobile.png');
  expect(errors).toEqual([]);
});
