// Copyright 2026 Redpanda Data, Inc.

import { loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginYaml } from '@rsbuild/plugin-yaml';
import { defineConfig } from '@rstest/core';

import coverageConfig from './coverage.config.json' with { type: 'json' };
import { fromHere, sharedAliases, sharedCoverage } from './test.shared';

const { publicVars } = loadEnv({ prefixes: ['REACT_APP_'] });
const RAW_QUERY = /raw/;

export default defineConfig({
  name: 'integration',
  globals: true,
  passWithNoTests: false,
  testEnvironment: {
    name: 'happy-dom',
    prebundle: 'auto',
  },
  pool: {
    type: 'threads',
    maxWorkers: '50%',
  },
  include: ['src/**/*.test.tsx', 'src/**/*.integration.test.ts', 'tests/**/*.integration.test.ts'],
  exclude: ['src/**/*.federation.test.tsx'],
  setupFiles: './rstest.setup.ts',
  testTimeout: 30_000,
  reporters: [['md', { preset: 'compact' }], ...(process.env.CI ? ['github-actions' as const] : [])],
  plugins: [pluginReact(), pluginSass(), pluginYaml()],
  performance: {
    buildCache: true,
  },
  output: {
    cssModules: {
      localIdentName: '[local]',
    },
  },
  resolve: {
    alias: {
      ...sharedAliases,
      'monaco-editor$': fromHere('./tests/mocks/monaco-editor.ts'),
      '@monaco-editor/react$': fromHere('./tests/mocks/monaco-editor-react.ts'),
    },
  },
  source: {
    decorators: {
      version: 'legacy',
    },
    define: {
      ...publicVars,
    },
  },
  tools: {
    bundlerChain: (chain) => {
      if (chain.module.rules.has('yaml')) {
        chain.module.rule('yaml').resourceQuery({ not: [RAW_QUERY] });
      }
      chain.module.rule('raw-source').resourceQuery(RAW_QUERY).type('asset/source');
    },
  },
  coverage: {
    ...sharedCoverage,
    reportsDirectory: 'coverage-integration',
    thresholds: coverageConfig.thresholds,
  },
});
