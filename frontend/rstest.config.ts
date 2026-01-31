import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginYaml } from '@rsbuild/plugin-yaml';
import { defineConfig } from '@rstest/core';

import path from 'node:path';

export default defineConfig({
  include: ['src/components/pages/shadowlinks/edit/shadowlink-edit-page.rstest.tsx'],
  testEnvironment: 'jsdom',
  setupFiles: ['./rstest.setup.tsx'],
  testTimeout: 30_000,
  globals: true,
  source: {
    tsconfigPath: './tsconfig.base.json',
    decorators: {
      version: 'legacy',
    },
  },
  resolve: {
    alias: {
      '@redpanda-data/ui': '@redpanda-data/ui/dist/index.js',
      '@bufbuild/buf': '@bufbuild/protobuf/dist/esm/index.js',
      'monaco-editor': 'monaco-editor/esm/vs/editor/editor.api.js',
      'lottie-web': path.resolve(__dirname, 'tests/mocks/lottie-web.ts'),
      '@tanstack/react-router': path.resolve(__dirname, 'tests/mocks/tanstack-react-router.ts'),
      config: path.resolve(__dirname, 'tests/mocks/config.ts'),
    },
  },
  plugins: [pluginReact(), pluginSass(), pluginYaml()],
});
