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
      vmMemoryLimit: '1000Mb',
      testTimeout: 30_000,
      globals: true,
      environment: 'node', // Unit tests use node environment
      include: ['src/**/*.test.ts'], // Only .test.ts files (unit tests)
      setupFiles: './vitest.setup.unit.ts',
      reporters: ['dot'],
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
