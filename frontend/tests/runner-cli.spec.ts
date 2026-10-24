import { expect, test } from '@rstest/core';

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('console CLI schedules independent files concurrently', () => {
  mkdirSync(resolve('tests/.rstest'), { recursive: true });
  const directory = mkdtempSync(resolve('tests/.rstest/runner-cli-'));
  try {
    for (const [name, other] of [
      ['first', 'second'],
      ['second', 'first'],
    ]) {
      writeFileSync(
        resolve(directory, `${name}.spec.ts`),
        `
        import { expect, test } from '@rstest/core';
        import { existsSync, writeFileSync } from 'node:fs';
        test('independent ${name} file', async () => {
          writeFileSync(${JSON.stringify(resolve(directory, name))}, 'started');
          await expect.poll(() => existsSync(${JSON.stringify(resolve(directory, other))}), {
            timeout: 1500, interval: 25,
          }).toBe(true);
        });
      `
      );
    }
    writeFileSync(
      resolve(directory, 'rstest.config.ts'),
      `
      import config from ${JSON.stringify(resolve('tests/test-variant-console/rstest.config.ts'))};
      export default {
        ...config,
        root: ${JSON.stringify(directory)},
        globalSetup: [],
        retry: 0,
      };
    `
    );
    const result = spawnSync('bun', ['run', 'rstest', '--config', resolve(directory, 'rstest.config.ts')], {
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
      timeout: 20_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const focused of [
  "test.only('focused', () => {});",
  "describe.only('focused', () => { test('nested', () => {}); });",
]) {
  test(`E2E CLI rejects focused coverage in CI: ${focused}`, () => {
    mkdirSync(resolve('tests/.rstest'), { recursive: true });
    const directory = mkdtempSync(resolve('tests/.rstest/runner-cli-'));
    try {
      writeFileSync(
        resolve(directory, 'focused.spec.ts'),
        `import { test, describe } from '@rstest/core';\n${focused}`
      );
      writeFileSync(
        resolve(directory, 'rstest.config.ts'),
        `
        import { e2eConfig } from ${JSON.stringify(resolve('tests/shared/rstest-config.ts'))};
        export default {
          ...e2eConfig('console', { workers: 1, retries: 0 }),
          root: ${JSON.stringify(directory)},
          globalSetup: [],
        };
      `
      );
      const result = spawnSync('bun', ['run', 'rstest', '--config', resolve(directory, 'rstest.config.ts')], {
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
        timeout: 20_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('Focused tests are forbidden in CI');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

for (const variant of ['console', 'console-enterprise']) {
  test(`E2E CLI preserves retry artifacts for ${variant}`, () => {
    mkdirSync(resolve('tests/.rstest'), { recursive: true });
    const directory = mkdtempSync(resolve('tests/.rstest/runner-cli-'));
    try {
      writeFileSync(
        resolve(directory, 'artifacts.spec.ts'),
        `
        import { expect, test as base } from ${JSON.stringify(resolve('tests/shared/e2e.ts'))};
        import { definePlaywrightOptions } from ${JSON.stringify(resolve('tests/shared/playwright-options.ts'))};
        import { existsSync, readFileSync, writeFileSync } from 'node:fs';
        const test = ${variant === 'console-enterprise' ? "base.extend({playwright: definePlaywrightOptions({storageState: {cookies: [], origins: []}}, 'console-enterprise')})" : 'base'};
        test('retry artifact policy', async ({ page, task, testInfo }) => {
          await page.setContent('<h1>Retry artifacts</h1>');
          const marker = ${JSON.stringify(resolve(directory, 'failure-path.txt'))};
          if (task.retryCount === 0) {
            expect(page.video()).toBeNull();
            writeFileSync(marker, testInfo.outputPath('failure.png'));
            throw new Error('Retry artifact canary');
          }
          expect(existsSync(readFileSync(marker, 'utf8'))).toBe(${variant === 'console'});
          expect(page.video() === null).toBe(${variant === 'console-enterprise'});
        });
      `
      );
      writeFileSync(
        resolve(directory, 'rstest.config.ts'),
        `
        import { e2eConfig } from ${JSON.stringify(resolve('tests/shared/rstest-config.ts'))};
        export default {
          ...e2eConfig(${JSON.stringify(variant)}, { workers: 1, retries: 1 }),
          root: ${JSON.stringify(directory)},
          globalSetup: [],
        };
      `
      );
      const result = spawnSync('bun', ['run', 'rstest', '--config', resolve(directory, 'rstest.config.ts')], {
        encoding: 'utf8',
        env: { ...process.env, CI: 'true' },
        timeout: 20_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.stdout + result.stderr).toContain('retry artifact policy');
      expect(result.status, result.stdout + result.stderr).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
