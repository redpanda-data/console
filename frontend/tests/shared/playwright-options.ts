import type { PlaywrightOptions } from '@rstest/playwright';
import { type BrowserContextOptions, devices } from 'playwright';

import { resolve } from 'node:path';

export function definePlaywrightOptions(
  overrides: BrowserContextOptions = {},
  variant = process.env.E2E_VARIANT ?? 'console'
): PlaywrightOptions {
  const enterprise = variant === 'console-enterprise';
  const baseURL = appURL('/', variant);
  return {
    launchOptions: { headless: !!process.env.CI },
    contextOptions: {
      ...devices['Desktop Chrome'],
      baseURL,
      permissions: ['clipboard-read', 'clipboard-write'],
      ...(enterprise ? { storageState: resolve('playwright/.auth/user.json') } : {}),
      ...overrides,
    },
    requestOptions: { baseURL },
    trace: 'on-first-retry',
  };
}

export function appURL(path: string, variant = process.env.E2E_VARIANT ?? 'console'): string {
  const ports: Record<string, number> = {
    console: 3000,
    'console-enterprise': 3100,
    kafka: 3002,
    'kafka-connect': 3200,
  };
  const port = ports[variant];
  if (!port) {
    throw new Error(`Unknown E2E variant: ${variant}`);
  }
  const baseURL = process.env.REACT_APP_ORIGIN ?? `http://localhost:${port}`;
  return new URL(path, baseURL).href;
}
