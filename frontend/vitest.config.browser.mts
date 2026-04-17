import yaml from '@rollup/plugin-yaml';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import envCompatible from 'vite-plugin-env-compatible';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import { sharedAliases } from './vitest.shared.mts';

const ENV_PREFIX = 'REACT_APP_';

// Animations MUST be disabled for visual regression screenshots. Without this,
// CSS transitions and JS-driven animations (motion/framer-motion spring physics)
// create race conditions: the screenshot captures a mid-animation frame that
// differs by a few pixels across browsers, OSes, and CI runs — causing flaky
// failures. Playwright's reducedMotion context option forces the browser to
// report `prefers-reduced-motion: reduce`, which:
//   1. Triggers the CSS override in vitest.browser.setup.ts (duration/delay → 0s)
//   2. Makes motion/framer-motion skip animations via its useReducedMotion() hook
const reducedMotion = { reducedMotion: 'reduce' } as const;

const chromium = { browser: 'chromium', context: reducedMotion } as const;

export default defineConfig({
  // Plugins beyond `react()` are console-local requirements:
  //   - envCompatible:  REACT_APP_* env var compatibility
  //   - tsconfigPaths:  resolve console's tsconfig path aliases (e.g. `components/…`)
  //   - yaml:           route module imports `.yaml` fixture files
  plugins: [
    react(),
    envCompatible({ prefix: ENV_PREFIX }),
    tsconfigPaths({ ignoreConfigErrors: true }),
    yaml(),
  ],
  resolve: { alias: sharedAliases, preserveSymlinks: true },
  optimizeDeps: {
    include: [
      '@bufbuild/protobuf',
      '@connectrpc/connect',
      '@connectrpc/connect-query',
      '@tanstack/react-router',
      '@tanstack/react-table',
      'vitest-browser-react',
      '@testing-library/jest-dom',
      'react',
      'react-dom',
    ],
  },
  test: {
    globals: true,
    setupFiles: './vitest.browser.setup.ts',
    include: ['src/**/*.browser.test.tsx'],
    testTimeout: 30_000,
    reporters: ['verbose'],
    typecheck: { enabled: false },
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: true,
      // Chromium only — visual regression baselines are Chromium-specific.
      // Cross-browser testing lives in e2e (Playwright with chromium/firefox/webkit).
      instances: [chromium],
      viewport: { width: 1440, height: 900 },
      expect: {
        toMatchScreenshot: {
          comparatorOptions: {
            allowedMismatchedPixelRatio: 0.02,
          },
        },
      },
    },
  },
});
