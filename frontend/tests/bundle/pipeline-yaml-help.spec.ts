import { test } from './fixtures';
import { expect, type Page } from '../shared/e2e';

async function pasteYaml(page: Page, yaml: string) {
  await page.evaluate((text) => navigator.clipboard.writeText(text), yaml);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}

test('pipeline YAML exposes field documentation and preserves syntax validation', async ({
  context,
  page,
  errors,
  testInfo,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/*.PipelineService/ListComponents', (route) =>
    route.fulfill({
      json: {
        components: {
          inputs: [
            {
              name: 'generate',
              type: 'input',
              summary: 'Generates messages at a regular interval.',
              config: {
                type: 'object',
                children: [
                  {
                    name: 'interval',
                    type: 'string',
                    kind: 'scalar',
                    description: 'The interval at which messages should be generated.',
                  },
                ],
              },
            },
          ],
        },
      },
    })
  );
  await page.goto('/rp-connect/create');
  const editor = page.locator('.monaco-editor').first();
  await expect(editor).toBeVisible();
  await editor.click({ position: { x: 150, y: 40 } });
  await pasteYaml(page, 'input:\n  generate:\n    mapping: root = this\n    interval: 1s');
  await editor.getByText('interval', { exact: true }).hover();
  await expect(page.getByText('The interval at which messages should be generated.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('yaml-field-help.png'), animations: 'disabled', fullPage: true });
  await testInfo.attach('yaml-field-help.png', {
    path: testInfo.outputPath('yaml-field-help.png'),
    contentType: 'image/png',
  });

  await page.keyboard.press('Escape');
  await pasteYaml(page, 'input: ]');
  await expect(editor.locator('.squiggly-error').first()).toBeVisible();
  await pasteYaml(page, 'input:\n  generate:\n    mapping: root = this\n    interval: 1s');
  await expect(editor.locator('.squiggly-error')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.getByText('interval', { exact: true }).hover();
  await expect(page.getByText('The interval at which messages should be generated.', { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('yaml-field-help-mobile.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await testInfo.attach('yaml-field-help-mobile.png', {
    path: testInfo.outputPath('yaml-field-help-mobile.png'),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
