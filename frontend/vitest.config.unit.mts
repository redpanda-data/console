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
    },
  };
});
