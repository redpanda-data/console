import { loadEnv } from 'vite';
import envCompatible from 'vite-plugin-env-compatible';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const ENV_PREFIX = 'REACT_APP_';

export default defineConfig(({ mode }) => {
  loadEnv(mode, 'env', ENV_PREFIX);

  return {
    // fsModuleCache caches filesystem module resolution between runs of the
    // same process. Ported from apps/adp-ui — cheap perf win on cold starts
    // and watch-mode reruns.
    experimental: { fsModuleCache: true },
    test: {
      fileParallelism: true,
      isolate: false,
      pool: 'threads',
      testTimeout: 30_000,
      globals: true,
      environment: 'node', // Unit tests use node environment
      include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], // Pure unit tests, including test-harness contracts
      exclude: ['tests/**/*.integration.test.ts'],
      setupFiles: './vitest.setup.unit.ts',
      reporters: ['default', ...(process.env.CI ? ['github-actions' as const] : [])],
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
        // Thresholds are only enforced on the combined (merged) run; per-config
        // thresholds are intentionally not set here because unit-only numbers
        // would be much lower than the merged baseline.
      },
    },
    plugins: [
      envCompatible({ prefix: ENV_PREFIX }),
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
    ],
    resolve: {
      preserveSymlinks: true,
      alias: {
        // monaco-editor is browser-only; stub it for Node unit tests
        'monaco-editor': new URL('./tests/mocks/monaco-editor.ts', import.meta.url).pathname,
        '@monaco-editor/react': new URL('./tests/mocks/monaco-editor-react.ts', import.meta.url).pathname,
        // @redpanda-data/ui has CSS that can't be parsed in Node
        '@redpanda-data/ui': new URL('./tests/mocks/redpanda-ui.ts', import.meta.url).pathname,
      },
    },
  };
});
