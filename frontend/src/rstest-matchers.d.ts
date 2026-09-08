// Copyright 2026 Redpanda Data, Inc.

import type * as jestDomMatchers from '@testing-library/jest-dom/matchers';

declare module '@rstest/core' {
  interface Matchers<T = unknown> extends jestDomMatchers.TestingLibraryMatchers<T, void> {}
}
