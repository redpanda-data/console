// Copyright 2026 Redpanda Data, Inc.

import { loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { defineConfig } from '@rstest/core';

import { sharedAliases } from './test.shared';

const { publicVars } = loadEnv({ prefixes: ['REACT_APP_'] });

export default defineConfig({
  name: 'browser-components',
  browser: { enabled: true, provider: 'playwright', headless: true },
  include: ['src/**/*.browser.test.tsx'],
  passWithNoTests: false,
  reporters: [['md', { preset: 'compact' }], ...(process.env.CI ? ['github-actions' as const] : [])],
  plugins: [pluginReact(), pluginTailwindcss()],
  // WARNING: Use Monaco's package entry; the minimal core entry lacks the YAML worker adapter.
  resolve: { alias: { '@bufbuild/buf$': sharedAliases['@bufbuild/buf$'] } },
  source: { define: { ...publicVars } },
  setupFiles: './tests/browser/components.setup.ts',
});
