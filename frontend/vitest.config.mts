import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import envCompatible from 'vite-plugin-env-compatible';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const ENV_PREFIX = 'REACT_APP_';

export default defineConfig(({ mode }) => {
  loadEnv(mode, 'env', ENV_PREFIX);

  return {
    test: {
      fileParallelism: true,
      poolOptions: {
        threads: {
          useAtomics: true,
          singleThread: false,
        },
      },
      pool: 'threads',
      testTimeout: 15000,
      globals: true,
      environment: 'jsdom',
      setupFiles: './vitest.setup.ts',
      alias: [
        {
          find: /^@redpanda-data\/ui$/, // For Redpanda UI we generate both CommonJS and ESM versions, but Vitest is ESM 1st, so we want to force ESM to be used.
          replacement: '@redpanda-data/ui/dist/index.js',
        },
        {
          find: /^@bufbuild\/buf$/,
          replacement: '@bufbuild/protobuf/dist/esm/index.js',
        },
        {
          find: /^monaco-editor$/,
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
    ],
    resolve: {
      preserveSymlinks: true,
    },
  };
});
