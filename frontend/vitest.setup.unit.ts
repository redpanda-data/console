// Minimal setup for pure unit tests
// No DOM mocking, no React-specific mocks
// These tests run in Node environment and don't need browser APIs

// Note: monaco-editor and @redpanda-data/ui are stubbed via resolve.alias in vitest.config.unit.mts

// Load Array/String prototype extensions (e.g. Array.prototype.removeAll)
// used by legacy state modules. Integration tests get this via
// vitest.setup.integration.ts; unit tests need it too because modules like
// ConnectorPropertiesStore.validate call `this.allGroups.removeAll(...)`.
import './src/utils/array-extensions';

import { vi } from 'vitest';

// Minimal window stub for modules that access window at import time (e.g., env.ts, ui.ts)
vi.stubGlobal('window', {
  ENABLED_FEATURES: '',
  location: { pathname: '/', hostname: 'localhost' },
  addEventListener: () => {},
  removeEventListener: () => {},
});

// document stub for state modules
vi.stubGlobal('document', {
  visibilityState: 'visible',
  addEventListener: () => {},
  removeEventListener: () => {},
});

// localStorage stub for state modules
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
});
