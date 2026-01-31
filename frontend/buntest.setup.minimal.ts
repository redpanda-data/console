/**
 * Minimal Bun test setup file for non-React tests
 * Only provides happy-dom for window/document globals
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { beforeEach, mock } from 'bun:test';

// Register happy-dom globals (window, document, etc.)
GlobalRegistrator.register();

// Import array extensions
import './src/utils/array-extensions';

// Mock document.getAnimations (not available in happy-dom)
Object.defineProperty(window.document, 'getAnimations', {
  writable: false,
  value: () => [],
});

// Mock ResizeObserver - not available in happy-dom but required by some components
class ResizeObserverMock {
  observe = mock(() => {});
  unobserve = mock(() => {});
  disconnect = mock(() => {});
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// @ts-expect-error - scrollTo not in happy-dom
window.scrollTo = mock(() => {});

// Mock localStorage - use Object.defineProperty since happy-dom makes it readonly
const localStorageMock = {
  getItem: mock(() => null),
  setItem: mock(() => {}),
  removeItem: mock(() => {}),
  clear: mock(() => {}),
  length: 0,
  key: mock(() => null),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Mock matchMedia - not available in happy-dom
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: mock((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: mock(() => {}),
      removeListener: mock(() => {}),
      addEventListener: mock(() => {}),
      removeEventListener: mock(() => {}),
      dispatchEvent: mock(() => {}),
    })),
  });
});
