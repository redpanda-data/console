// Copyright 2026 Redpanda Data, Inc.
import { createRsbuild } from '@rsbuild/core';
import { describe, expect, test } from '@rstest/core';

import rsbuildConfig from '../rsbuild.config';
import react19Config from '../rsbuild.config.react19';

describe('rsbuild production config', () => {
  test('uses the optimized compiler and chunking pipeline', async () => {
    const rsbuild = await createRsbuild({
      config: rsbuildConfig,
      cwd: process.cwd(),
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
    expect(rspackConfig?.optimization?.splitChunks).toMatchObject({
      chunks: 'all',
      maxAsyncSize: 4 * 1024 * 1024,
    });
    expect(serializedConfig).toContain('reactCompiler');
    expect(serializedConfig).not.toContain('babel-loader');
    expect(serializedConfig).toContain('"parallel":true');
  });
});

test('builds an independent federation-only container without a second SPA entry', async () => {
  const rsbuild = await createRsbuild({ config: react19Config, cwd: process.cwd() });
  const { origin } = await rsbuild.inspectConfig({ mode: 'production' });
  const [config] = origin.bundlerConfigs;
  expect(config?.entry).toEqual({});
  expect(config?.output).toMatchObject({ publicPath: 'auto' });
  expect(config?.plugins?.some((plugin) => plugin?.constructor.name === 'HtmlRspackPlugin')).toBe(false);
});
