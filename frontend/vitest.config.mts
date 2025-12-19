import yaml from '@rollup/plugin-yaml';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import envCompatible from 'vite-plugin-env-compatible';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const ENV_PREFIX = 'REACT_APP_';

// Regex patterns for module resolution
const REDPANDA_UI_REGEX = /^@redpanda-data\/ui$/;
const BUFBUILD_REGEX = /^@bufbuild\/buf$/;
const MONACO_EDITOR_REGEX = /^monaco-editor$/;

export default defineConfig(({ mode }) => {
  loadEnv(mode, 'env', ENV_PREFIX);

  return {
    test: {
      fileParallelism: true,
      vmMemoryLimit: '1000Mb',
      testTimeout: 15_000,
      globals: true,
      environment: 'jsdom',
      setupFiles: './vitest.setup.ts',
      deps: {
        registerNodeLoader: true,
      },
      alias: [
        {
          find: REDPANDA_UI_REGEX, // For Redpanda UI we generate both CommonJS and ESM versions, but Vitest is ESM 1st, so we want to force ESM to be used.
          replacement: '@redpanda-data/ui/dist/index.js',
        },
        {
          find: BUFBUILD_REGEX,
          replacement: '@bufbuild/protobuf/dist/esm/index.js',
        },
        {
          find: MONACO_EDITOR_REGEX,
          replacement: 'monaco-editor/esm/vs/editor/editor.api.js',
        },
      ],
      reporters: ['default', 'html'],
      typecheck: {
        enabled: false,
      },
      coverage: {
        enabled: false,
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/protogen/**/*'],
      },
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    plugins: [
      react(),
      envCompatible({ prefix: ENV_PREFIX }),
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
      yaml(),
    ],
    resolve: {
      preserveSymlinks: true,
    },
  };
});
