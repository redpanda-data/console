import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import './tests/mock-document';
import './tests/mock-react-select';

window.scrollTo = vi.fn();

// Mock ResizeObserver - not available in jsdom but required by RadixUI components
// (Switch, Tabs, etc.) that use @radix-ui/react-use-size internally
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
