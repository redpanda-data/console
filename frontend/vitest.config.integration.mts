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
      fileParallelism: false, // Sequential execution (prevents parallel OOM, auto sets maxWorkers: 1)
      isolate: true, // Fresh environment per test file (default, explicit for clarity)
      pool: 'forks', // Each test file runs in separate child process (default)
      testTimeout: 30_000,
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
