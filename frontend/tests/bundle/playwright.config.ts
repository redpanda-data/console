import { defineConfig } from '@playwright/test';

import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  maxFailures: 3,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    video: 'on',
  },
  webServer: {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    command: 'node tests/bundle/serve.mjs',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
  },
});
