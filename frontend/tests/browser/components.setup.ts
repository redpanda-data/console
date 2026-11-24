// Copyright 2026 Redpanda Data, Inc.

import { afterEach, expect } from '@rstest/core';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

import '../../src/globals.css';

expect.extend(jestDomMatchers);

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
