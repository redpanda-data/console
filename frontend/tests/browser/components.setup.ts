// Copyright 2026 Redpanda Data, Inc.

import { afterEach } from '@rstest/core';
import { cleanup } from '@testing-library/react';

import '../../src/globals.css';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
