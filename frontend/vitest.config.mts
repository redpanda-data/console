import yaml from '@rollup/plugin-yaml';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import envCompatible from 'vite-plugin-env-compatible';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

import { sharedAliases } from './vitest.shared.mts';

const ENV_PREFIX = 'REACT_APP_';

// Default config used by test:file and test:watch
export default defineConfig(({ mode }) => {
  loadEnv(mode, 'env', ENV_PREFIX);

  return {
    test: {
      fileParallelism: true,
      vmMemoryLimit: '1000Mb',
      testTimeout: 15_000,
      globals: true,
      environment: 'happy-dom',
      setupFiles: './vitest.setup.ts',
      deps: {
        registerNodeLoader: true,
      },
      alias: sharedAliases,
      reporters: ['verbose', ...(process.env.CI ? ['github-actions' as const] : [])],
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
