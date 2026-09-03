// Copyright 2026 Redpanda Data, Inc.

import { defineConfig } from '@rstest/core';

export default defineConfig({
  projects: ['./rstest.config.unit.ts', './rstest.config.integration.ts'],
});
