import { defineConfig } from '@rstest/core';
import { withRsbuildConfig } from '@rstest/adapter-rsbuild';

export default defineConfig({
  extends: withRsbuildConfig({
    configPath: './rsbuild.config.test.ts',
  }),
  globals: true,
  testEnvironment: 'happy-dom',
  include: ['src/**/*.rstest.tsx'],
  setupFiles: ['./rstest.setup.ts'],
  testTimeout: 30000,
});
