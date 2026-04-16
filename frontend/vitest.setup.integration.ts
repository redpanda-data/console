// ── happy-dom scheduler fix ──────────────────────────────────────────
// Must run BEFORE React loads. happy-dom's MessageChannel delivers
// messages synchronously during act() flushes, which triggers React 18's
// "Should not already be working" error. Removing MessageChannel forces
// React's scheduler to use the setTimeout fallback, which is async-safe.
if (typeof globalThis.MessageChannel !== 'undefined') {
  // biome-ignore lint/suspicious/noExplicitAny: deleting a global at runtime
  delete (globalThis as any).MessageChannel;
}

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import _rawUserEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi } from 'vitest';
import './src/utils/array-extensions';
import './tests/mock-document';
import './tests/mock-react-select';
import { cleanupTestHarness } from './tests/harness-cleanup';

// ── Chakra + userEvent compatibility ─────────────────────────────────
// userEvent.setup() patches HTMLElement.prototype.focus as a getter-only
// property. Chakra UI's @zag-js/focus-visible later tries to override it
// via simple assignment, causing "Cannot set property focus of [object
// Object] which has only a getter". Wrapping setup() makes the patched
// focus descriptor accept assignment after the patch.
function makeFocusPatchWritable() {
  const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'focus');
  if (desc?.get && !desc.set && desc.configurable) {
    const getter = desc.get;
    let override: ((...args: unknown[]) => void) | null = null;
    Object.defineProperty(HTMLElement.prototype, 'focus', {
      configurable: true,
      get() {
        return override ?? getter();
      },
      set(fn: (...args: unknown[]) => void) {
        override = fn;
      },
    });
  }
}

// Monkey-patch userEvent.setup globally so every test file gets the fix
// without migrating imports. Any `import userEvent from '@testing-library/user-event'`
// call receives the patched setup transparently.
const _rawSetup = _rawUserEvent.setup.bind(_rawUserEvent);
_rawUserEvent.setup = ((...args: Parameters<typeof _rawUserEvent.setup>) => {
  const instance = _rawSetup(...args);
  makeFocusPatchWritable();
  return instance;
}) as typeof _rawUserEvent.setup;

// ── happy-dom network / resource isolation ───────────────────────────
// Unlike jsdom, happy-dom attempts real network requests for scripts,
// images, and fetch calls. Disable external loading + same-origin policy
// to suppress AbortError / ECONNREFUSED noise from unmocked endpoints.
if (typeof window !== 'undefined' && 'happyDOM' in window) {
  // biome-ignore lint/suspicious/noExplicitAny: happy-dom settings shape is not typed
  const settings = (window as any).happyDOM?.settings;
  if (settings) {
    settings.navigation = { ...settings.navigation, disableMainFrameNavigation: true };
    settings.fetch = { ...settings.fetch, disableSameOriginPolicy: true };
    settings.disableJavaScriptFileLoading = true;
    settings.disableCSSFileLoading = true;
    settings.disableJavaScriptEvaluation = true;
  }
}

// Intercept fetch to known test-environment localhost URLs so mocked
// endpoints don't escape to real TCP connections. Relative URLs are
// resolved against window.location (happy-dom defaults to localhost:3000),
// so we MUST resolve them before matching, otherwise ConnectRPC transports
// built with an empty baseUrl (common in test-utils) leak real TCP
// connections to 127.0.0.1:3000 / ::1:3000 and emit AggregateError on
// teardown.
if (typeof window !== 'undefined') {
  const originalFetch = globalThis.fetch;
  const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '::1'];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    try {
      // Resolve relative URLs against window.location so that a relative
      // path like "/service/Method" is matched the same way as the
      // absolute "http://localhost:3000/service/Method".
      const base = window.location ? window.location.href : undefined;
      const parsed = new URL(url, base);
      if (BLOCKED_HOSTS.some((h) => parsed.hostname === h)) {
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    } catch {
      // Malformed URL — pass through so the caller gets a normal error
    }
    return originalFetch(input, init);
  };
}

// ── Mocks ────────────────────────────────────────────────────────────
// happy-dom ships ResizeObserver / matchMedia / scrollTo / crypto natively,
// but Chakra components still expect matchMedia to be a vi.fn so their
// colorMode polling sees deterministic breakpoint results.
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

// Mock lottie-react — lottie-web schedules animation frames that leak
// across tests even when canvas access is stubbed by the environment.
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

// Explicit cleanup after each test to prevent memory leaks.
//
// Order matters:
//   1. cleanup() unmounts RTL-rendered React trees so stores are no longer
//      observed by subscribers before we replace their state.
//   2. resetAllZustandStores() restores each module-level store to its
//      initial state. Without this, state accumulated by the page under test
//      (topic lists, cluster overviews, API caches, etc.) stays retained in
//      the worker process for every subsequent test in the file — the
//      primary cause of the +100–240 MB intra-file heap growth measured
//      during the TDD audit.
//   3. clearAllMocks / clearAllTimers is standard Vitest hygiene.
// Explicit cleanup after each test to prevent memory leaks.
//
// Order matters:
//   1. cleanup() unmounts RTL-rendered React trees so stores/queries are no
//      longer observed by subscribers before teardown.
//   2. cleanupTestHarness() drops tracked QueryClients + routers held alive
//      by test-file closures (primary source of +100–240 MB intra-file heap
//      growth measured during the TDD audit).
//   3. clearAllMocks / clearAllTimers is standard Vitest hygiene.
//
// Zustand store resets are handled per-file via
// `tests/reset-zustand-stores.ts` rather than globally — mounting that helper
// here pins `isEmbedded`/`isAdpEnabled` live bindings before test files'
// `vi.mock('config', ...)` hoists can take effect. Files that accumulate
// store state import the helper directly and opt in.
afterEach(() => {
  cleanup();
  cleanupTestHarness();
  vi.clearAllMocks();
  vi.clearAllTimers();
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
  // happy-dom DOMException noise from unmocked fetch/script loads
  /DOMException.*AbortError/,
  /Failed to load script/,
  // Network noise from fetch attempts to mocked endpoints that aren't running
  /socket hang up/,
  /ECONNREFUSED/,
  /ECONNRESET/,
];

function isSuppressed(args: unknown[]): boolean {
  // Join every argument so patterns also catch cases like
  // console.warn('prefix:', errorObject) where the signal lives in args[1].
  const msg = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
  return SUPPRESSED_PATTERNS.some((pattern) => pattern.test(msg));
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
