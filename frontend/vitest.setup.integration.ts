import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import './src/utils/array-extensions';
import './tests/mock-document';
import './tests/mock-react-select';

// Full setup for integration tests that render React components
// These tests run in jsdom environment and need browser API mocks

// Explicit cleanup after each test to prevent memory leaks
afterEach(() => {
  cleanup(); // Unmount all React trees
  vi.clearAllMocks(); // Clear mock call history
  vi.clearAllTimers(); // Clear pending timers

  // Re-stub ResizeObserver to clear any instances from previous test
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

// Mock ResizeObserver - not available in jsdom but required by RadixUI components
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

window.scrollTo = vi.fn();

// Mock lottie-react - lottie-web tries to access canvas APIs not available in jsdom
vi.mock('lottie-react', () => ({
  useLottie: () => ({
    View: null,
    play: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    setSpeed: vi.fn(),
    goToAndStop: vi.fn(),
    goToAndPlay: vi.fn(),
    setDirection: vi.fn(),
    playSegments: vi.fn(),
    setSubframe: vi.fn(),
    destroy: vi.fn(),
    getDuration: vi.fn(),
    animationItem: null,
    animationContainerRef: { current: null },
    animationLoaded: false,
  }),
}));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // Deprecated
      removeListener: vi.fn(), // Deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});
