// Copyright 2026 Redpanda Data, Inc.

import { federation } from '@module-federation/rstest';
import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rstest/core';

import { fileURLToPath } from 'node:url';

const react19RemoteEntry = fileURLToPath(new URL('./tests/federation/react19-remote-adapter.cjs', import.meta.url));

export default defineConfig({
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
        rp_console_react19: `commonjs ${react19RemoteEntry}`,
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.3.0' },
        'react/jsx-runtime': { singleton: true, requiredVersion: '^19.3.0' },
        'react/jsx-dev-runtime': { singleton: true, requiredVersion: '^19.3.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.3.0' },
        'react-dom/client': { singleton: true, requiredVersion: '^19.3.0' },
      },
    }),
  ],
  performance: {
    buildCache: true,
  },
});
