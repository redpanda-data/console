import yaml from '@rollup/plugin-yaml';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import envCompatible from 'vite-plugin-env-compatible';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

import { sharedAliases } from './vitest.shared.mts';

const ENV_PREFIX = 'REACT_APP_';
const MONACO_EDITOR_REACT_PATTERN = /^@monaco-editor\/react$/;
const MONACO_EDITOR_PATTERN = /^monaco-editor$/;

export default defineConfig(({ mode }) => {
  loadEnv(mode, 'env', ENV_PREFIX);
  const integrationAliases = [
    {
      find: MONACO_EDITOR_REACT_PATTERN,
      replacement: new URL('./tests/mocks/monaco-editor-react.ts', import.meta.url).pathname,
    },
    {
      find: MONACO_EDITOR_PATTERN,
      replacement: new URL('./tests/mocks/monaco-editor.ts', import.meta.url).pathname,
    },
    ...sharedAliases,
  ];

  return {
    // fsModuleCache caches filesystem module resolution between runs of the
    // same process. Ported from apps/adp-ui — cheap perf win on cold starts
    // and watch-mode reruns, especially with the large route tree + proto
    // output that Vitest would otherwise stat on every resolution.
    experimental: { fsModuleCache: true },
    test: {
      fileParallelism: true,
      isolate: true,
      pool: 'forks',
      testTimeout: 30_000,
      globals: true,
      environment: 'happy-dom', // Aligns with cloud-ui / adp-ui; required to run Chakra + Radix integration tests consistently
      include: ['src/**/*.test.tsx', 'tests/**/*.integration.test.ts'],
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
      alias: integrationAliases,
      reporters: ['default', ...(process.env.CI ? ['github-actions' as const] : [])],
      typecheck: {
        enabled: false,
      },
      coverage: {
        // Default off so local dev watch/test runs stay fast. Enable via
        // `--coverage` flag (see `test:coverage` script).
        enabled: false,
        provider: 'v8',
        reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/protogen/**',
          'src/routeTree.gen.ts',
          '**/*.test.{ts,tsx}',
          '**/*.spec.{ts,tsx}',
          'src/**/*.stories.tsx',
        ],
        // Thresholds are enforced on the merged (unit + integration) summary
        // via `scripts/check-coverage-thresholds.mjs`, which the CI
        // `test-coverage` job runs after `merge-coverage.mjs`. Per-config
        // thresholds would trip on integration-only numbers, so we skip them.
      },
    },
    plugins: [
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: './src/routes',
        generatedRouteTree: './src/routeTree.gen.ts',
        quoteStyle: 'single',
        semicolons: true,
      }),
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
