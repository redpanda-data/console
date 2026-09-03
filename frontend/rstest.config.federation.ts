// Copyright 2026 Redpanda Data, Inc.

import { federation } from '@module-federation/rstest';
import { pluginReact } from '@rsbuild/plugin-react';
import { defineProject } from '@rstest/core';

import { fileURLToPath } from 'node:url';

const remoteEntry = fileURLToPath(new URL('./tests/federation/remote-adapter.cjs', import.meta.url));

export default defineProject({
  name: 'federation',
  globals: true,
  passWithNoTests: false,
  testEnvironment: 'happy-dom',
  pool: {
    type: 'threads',
    maxWorkers: 1,
  },
  include: ['src/**/*.federation.test.tsx'],
  globalSetup: './tests/federation/rstest-global-setup.ts',
  testTimeout: 30_000,
  reporters: [['md', { preset: 'compact' }], ...(process.env.CI ? ['github-actions' as const] : [])],
  plugins: [
    pluginReact(),
    federation({
      name: 'rp_console_federation_test',
      remotes: {
        rp_console: `commonjs ${remoteEntry}`,
      },
    }),
  ],
  performance: {
    buildCache: true,
  },
});
