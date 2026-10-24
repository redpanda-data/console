import { test as base, type PlaywrightOptions } from '@rstest/playwright';

import { definePlaywrightOptions } from './playwright-options';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// biome-ignore lint/performance/noBarrelFile: Tests use one fixture entrypoint with Playwright-aware assertions.
export { expect } from '@rstest/playwright';
export type { BrowserContext, Download, Locator, Page, Request, Route } from 'playwright';

export { retryAssertion, step } from './assertions';
export { appURL } from './playwright-options';

export type TestArtifacts = {
  outputPath: (name: string) => string;
  attach: (name: string, options: { path?: string; body?: string; contentType: string }) => Promise<void>;
};

const variantBase = process.env.E2E_VARIANT
  ? base.extend<{ playwright: PlaywrightOptions }>({
      playwright: async ({ task }, use) => {
        const recordVideo =
          process.env.E2E_VARIANT !== 'console-enterprise' && task.retryCount === 1
            ? { dir: resolve('.rstest/videos', task.id) }
            : undefined;
        await use(definePlaywrightOptions({ recordVideo }));
      },
    })
  : base;

export const test = variantBase.extend<{
  featureFlags: Record<string, boolean>;
  testInfo: TestArtifacts;
  preparePage: undefined;
}>({
  featureFlags: {},
  testInfo: async ({ task }, use) => {
    const directory = resolve('.rstest/artifacts', `${task.id}-${task.retryCount}`);
    await mkdir(directory, { recursive: true });
    await use({
      outputPath: (name) => resolve(directory, name),
      attach: async (name, { path, body, contentType }) => {
        const file = path ?? resolve(directory, name);
        if (body !== undefined) {
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, body);
        }
        const attachments = task.meta.attachments;
        task.meta.attachments = [...(Array.isArray(attachments) ? attachments : []), { name, path: file, contentType }];
      },
    });
  },
  preparePage: [
    async ({ page, featureFlags, onTestFailed, task }, use) => {
      page.setDefaultTimeout(30_000);
      page.setDefaultNavigationTimeout(30_000);
      if (Object.keys(featureFlags).length > 0) {
        await page.addInitScript((flags) => {
          Object.assign(window, { __E2E_FEATURE_FLAGS__: flags });
        }, featureFlags);
      }
      if (process.env.E2E_VARIANT !== 'console-enterprise') {
        onTestFailed(async () => {
          const path = resolve('.rstest/artifacts', `${task.id}-${task.retryCount}`, 'failure.png');
          await mkdir(dirname(path), { recursive: true });
          await page.screenshot({ path, fullPage: true });
        });
      }
      await use(undefined);
    },
    { auto: true },
  ],
});
