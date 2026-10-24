// Copyright 2026 Redpanda Data, Inc.

import { defineConfig } from '@rsbuild/core';

import { react19ModuleFederationConfig } from './module-federation.config';
import baseConfig, { consolePlugins } from './rsbuild.config';

export default defineConfig({
  ...baseConfig,
  plugins: consolePlugins(react19ModuleFederationConfig),
  source: {
    ...baseConfig.source,
    entry: {},
  },
  output: {
    ...baseConfig.output,
    distPath: { root: 'build/react-19' },
  },
});
