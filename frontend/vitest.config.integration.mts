import yaml from '@rollup/plugin-yaml';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import envCompatible from 'vite-plugin-env-compatible';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

import { sharedAliases } from './vitest.shared.mts';

const ENV_PREFIX = 'REACT_APP_';

export default defineConfig(({ mode }) => {
  loadEnv(mode, 'env', ENV_PREFIX);

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
      vmMemoryLimit: '4096Mb', // Force GC when memory limit is reached (4GB allows headroom for parallel forks)
      testTimeout: 30_000,
      globals: true,
      environment: 'happy-dom', // Aligns with cloud-ui / adp-ui; required to run Chakra + Radix integration tests consistently
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
      alias: sharedAliases,
      reporters: ['verbose', ...(process.env.CI ? ['github-actions' as const] : [])],
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
