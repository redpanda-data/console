// Copyright 2026 Redpanda Data, Inc.

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module '@rstest/core' {
  interface Assertion<T> extends TestingLibraryMatchers<T, void> {}
}
