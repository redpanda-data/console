// Copyright 2026 Redpanda Data, Inc.

import { defineConfig } from '@rsbuild/core';

import { react19ModuleFederationConfig } from './module-federation.config';
import baseConfig, { consolePlugins, consoleTools } from './rsbuild.config';

// Build after the main app: its clean step removes this subtree.
export default defineConfig({
  plugins: consolePlugins(react19ModuleFederationConfig),
  source: baseConfig.source,
  server: { publicDir: { ignore: ['index.html'] } },
  performance: baseConfig.performance,
  splitChunks: baseConfig.splitChunks,
  output: {
    ...baseConfig.output,
    cleanDistPath: true,
    distPath: { root: 'build/react-19' },
  },
  tools: consoleTools({ federationOnly: true }),
});
