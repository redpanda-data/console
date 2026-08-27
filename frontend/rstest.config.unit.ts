// Copyright 2026 Redpanda Data, Inc.

import { loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginYaml } from '@rsbuild/plugin-yaml';
import { defineProject } from '@rstest/core';

import { fromHere, sharedAliases, sharedCoverage } from './test.shared';

const { publicVars } = loadEnv({ prefixes: ['REACT_APP_'] });
const RAW_QUERY = /raw/;

export default defineProject({
  name: 'unit',
  globals: true,
  isolate: false,
  passWithNoTests: false,
  testEnvironment: 'node',
  pool: {
    type: 'threads',
  },
  include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  exclude: ['tests/**/*.integration.test.ts'],
  setupFiles: './rstest.setup.unit.ts',
  testTimeout: 30_000,
  reporters: [['md', { preset: 'compact' }], ...(process.env.CI ? ['github-actions' as const] : [])],
  plugins: [pluginReact(), pluginSass(), pluginYaml()],
  performance: {
    buildCache: true,
  },
  resolve: {
    alias: {
      ...sharedAliases,
      'monaco-editor$': fromHere('./tests/mocks/monaco-editor.ts'),
      '@monaco-editor/react$': fromHere('./tests/mocks/monaco-editor-react.ts'),
      '@redpanda-data/ui$': fromHere('./tests/mocks/redpanda-ui.ts'),
      './console-app$': false,
    },
  },
  output: {
    bundleDependencies: ['@xyflow/react', 'react-data-grid'],
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
    reportsDirectory: 'coverage',
  },
});
