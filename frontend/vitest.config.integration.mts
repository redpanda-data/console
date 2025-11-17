import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import envCompatible from 'vite-plugin-env-compatible';
import yaml from '@rollup/plugin-yaml';

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
      testTimeout: 30000,
      globals: true,
      environment: 'jsdom', // Integration tests use jsdom environment
      include: ['src/**/*.test.tsx'], // Only .test.tsx files (integration tests)
      setupFiles: './vitest.setup.integration.ts',
      deps: {
        registerNodeLoader: true,
      },
      css: {
        modules: {
          classNameStrategy: 'non-scoped',
        },
      },
      server: {
        deps: {
          inline: [
            'katex',
            'streamdown',
            'rehype-harden',
            'character-entities',
            'decode-named-character-reference',
            'parse-entities',
            'stringify-entities',
            'character-entities-html4',
            'character-entities-legacy',
          ],
        },
      },
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
      reporters: ['dot'],
      typecheck: {
        enabled: false,
      },
      coverage: {
        enabled: false,
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/proto/**/*'],
      },
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
