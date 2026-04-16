import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import './src/utils/array-extensions';
import './tests/mock-document';
import './tests/mock-react-select';

// Full setup for integration tests that render React components.
// Tests run in jsdom and need browser API mocks.

// ── Mocks ────────────────────────────────────────────────────────────
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

// Explicit cleanup after each test to prevent memory leaks
afterEach(() => {
  cleanup(); // Unmount all React trees
  vi.clearAllMocks(); // Clear mock call history
  vi.clearAllTimers(); // Clear pending timers

  // Re-stub ResizeObserver to clear any instances from previous test
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

// ── Console suppression ──────────────────────────────────────────────
// Suppress library warnings that are not actionable from tests and
// pollute CI logs. Each pattern maps to a specific upstream issue or
// migration-in-progress; removing a pattern requires fixing the source
// component, not silencing here.
// biome-ignore lint/suspicious/noConsole: test setup needs to intercept console for warning suppression
const originalWarn = console.warn;
// biome-ignore lint/suspicious/noConsole: test setup needs to intercept console for warning suppression
const originalError = console.error;

const SUPPRESSED_PATTERNS = [
  // Radix UI ref-forwarding — fixed in React 19, not actionable in React 18
  /Function components cannot be given refs/,
  // Radix DialogContent missing Description/aria-describedby — tracked separately for a11y
  /Missing `Description` or `aria-describedby=\{undefined\}` for \{DialogContent\}/,
  // Radix Radio/Tooltip apply state updates outside the act() window after
  // userEvent awaited clicks resolve. Not actionable from tests; source fix
  // belongs in @radix-ui.
  /An update to Radio inside a test was not wrapped in act/,
  /An update to Tooltip inside a test was not wrapped in act/,
  // jsdom DOMException noise from unmocked fetch/script loads
  /DOMException.*AbortError/,
  /Failed to load script/,
  // Network noise from jsdom making real HTTP requests to mocked endpoints
  /socket hang up/,
  /ECONNREFUSED/,
  /ECONNRESET/,
];

function isSuppressed(args: unknown[]): boolean {
  return SUPPRESSED_PATTERNS.some((pattern) => {
    const msg = typeof args[0] === 'string' ? args[0] : String(args[0]);
    return pattern.test(msg);
  });
}

console.warn = (...args: unknown[]) => {
  if (!isSuppressed(args)) {
    originalWarn(...args);
  }
};
console.error = (...args: unknown[]) => {
  if (!isSuppressed(args)) {
    originalError(...args);
  }
};
