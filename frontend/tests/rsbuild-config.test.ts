// Copyright 2026 Redpanda Data, Inc.

import { createRsbuild } from '@rsbuild/core';
import { describe, expect, it, vi } from 'vitest';

import { fileURLToPath } from 'node:url';

vi.mock('@module-federation/rsbuild-plugin', () => ({
  pluginModuleFederation: () => ({
    name: 'test:module-federation',
    setup: () => undefined,
  }),
}));

import rsbuildConfig from '../rsbuild.config';

describe('Rsbuild production config', () => {
  it('uses the optimized compiler and chunking pipeline', async () => {
    const rsbuild = await createRsbuild({
      config: rsbuildConfig,
      cwd: fileURLToPath(new URL('..', import.meta.url)),
    });
    const { origin } = await rsbuild.inspectConfig({ mode: 'production' });
    const [rspackConfig] = origin.bundlerConfigs;
    const serializedConfig = JSON.stringify(rspackConfig);

    expect(rspackConfig?.experiments).toMatchObject({
      asyncWebAssembly: true,
      futureDefaults: true,
      nativeWatcher: true,
      pureFunctions: true,
      sourceImport: true,
    });
    expect(rspackConfig?.experiments).not.toHaveProperty('fasterModuleConcatenation');
    expect(rspackConfig?.experiments).not.toHaveProperty('lazyBarrel');
    expect(rspackConfig?.optimization?.splitChunks).toMatchObject({
      chunks: 'all',
      maxAsyncSize: 512 * 1024,
    });
    expect(serializedConfig).toContain('reactCompiler');
    expect(serializedConfig).not.toContain('babel-loader');
    expect(serializedConfig).toContain('"parallel":true');
  });
});
