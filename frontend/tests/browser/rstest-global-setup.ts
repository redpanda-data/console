import { createRsbuild } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

import { resolve } from 'node:path';

export default async function setup() {
  const builder = await createRsbuild({
    cwd: process.cwd(),
    config: {
      mode: 'development',
      plugins: [pluginReact()],
      source: { entry: { 'ui-sdk-patterns': resolve('tests/browser/fixtures/ui-sdk-patterns.tsx') } },
      dev: { hmr: false },
      output: {
        distPath: { root: resolve('.rstest/sdk-browser') },
        filename: { js: '[name].js' },
        injectStyles: true,
        sourceMap: false,
      },
      performance: { chunkSplit: { strategy: 'all-in-one' } },
    },
  });
  await builder.build();
}
