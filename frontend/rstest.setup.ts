// Copyright 2026 Redpanda Data, Inc.

// React 19 under Rstest's prebundled happy-dom no longer needs the former MessageChannel deletion workaround.
import { afterEach, beforeEach, expect, rs } from '@rstest/core';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import './src/utils/array-extensions';
import './tests/mock-document';

import { cleanupTestHarness } from './tests/harness-cleanup';
import { createMemoryStorage } from './tests/memory-storage';

expect.extend(jestDomMatchers);

// Node 24 exposes an opt-in global localStorage getter that returns undefined
// unless --localstorage-file is provided. Install a deterministic per-worker
// Storage implementation instead of letting that host getter shadow
// happy-dom's storage.
const testLocalStorage = createMemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
});
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
});

// ── happy-dom network / resource isolation ───────────────────────────
// Unlike jsdom, happy-dom attempts real network requests for scripts,
// images, and fetch calls. Disable external loading + same-origin policy
// to suppress AbortError / ECONNREFUSED noise from unmocked endpoints.
if (typeof window !== 'undefined' && 'happyDOM' in window) {
  const happyDOM = Reflect.get(window, 'happyDOM');
  if (typeof happyDOM === 'object' && happyDOM !== null) {
    const settings = Reflect.get(happyDOM, 'settings');
    if (typeof settings === 'object' && settings !== null) {
      const navigation = Reflect.get(settings, 'navigation');
      const fetchSettings = Reflect.get(settings, 'fetch');
      Reflect.set(settings, 'navigation', {
        ...(typeof navigation === 'object' && navigation !== null ? navigation : {}),
        disableMainFrameNavigation: true,
      });
      Reflect.set(settings, 'fetch', {
        ...(typeof fetchSettings === 'object' && fetchSettings !== null ? fetchSettings : {}),
        disableSameOriginPolicy: true,
      });
      Reflect.set(settings, 'disableJavaScriptFileLoading', true);
      Reflect.set(settings, 'disableCSSFileLoading', true);
      Reflect.set(settings, 'disableJavaScriptEvaluation', true);
    }
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

// Polyfill Element/Document.getAnimations — happy-dom doesn't implement them
// but Base UI's ScrollAreaViewport calls them from a setTimeout.
if (typeof Element !== 'undefined' && typeof Element.prototype.getAnimations !== 'function') {
  Element.prototype.getAnimations = () => [];
}
if (typeof Document !== 'undefined' && typeof Document.prototype.getAnimations !== 'function') {
  Document.prototype.getAnimations = () => [];
}

// ── Mocks ────────────────────────────────────────────────────────────
// happy-dom ships ResizeObserver / matchMedia / scrollTo / crypto natively, but
// matchMedia must be an rs.fn so media-query reads (the theme provider's
// prefers-color-scheme, responsive hooks) return a deterministic `matches: false`.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: rs.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: rs.fn(), // Deprecated
      removeListener: rs.fn(), // Deprecated
      addEventListener: rs.fn(),
      removeEventListener: rs.fn(),
      dispatchEvent: rs.fn(),
    })),
  });
});

// Mock lottie-react — lottie-web schedules animation frames that leak
// across tests even when canvas access is stubbed by the environment.
rs.mock('lottie-react', () => ({
  useLottie: () => ({
    View: null,
    play: rs.fn(),
    stop: rs.fn(),
    pause: rs.fn(),
    setSpeed: rs.fn(),
    goToAndStop: rs.fn(),
    goToAndPlay: rs.fn(),
    setDirection: rs.fn(),
    playSegments: rs.fn(),
    setSubframe: rs.fn(),
    destroy: rs.fn(),
    getDuration: rs.fn(),
    animationItem: null,
    animationContainerRef: { current: null },
    animationLoaded: false,
  }),
}));

// Explicit cleanup after each test to prevent memory leaks.
//
// Order matters:
//   1. cleanup() unmounts RTL-rendered React trees so stores/queries are no
//      longer observed by subscribers before teardown.
//   2. cleanupTestHarness() drops tracked QueryClients + routers held alive
//      by test-file closures (primary source of +100–240 MB intra-file heap
//      growth measured during the TDD audit).
//   3. clearAllMocks / clearAllTimers is standard test hygiene.
//
// Zustand store resets are intentionally not mounted here: importing any
// store pins `isEmbedded` live bindings before test files'
// `rs.mock('config', ...)` hoists can take effect. Tests that accumulate
// store state should reset it explicitly in their own setup.
afterEach(async () => {
  cleanup();
  await cleanupTestHarness();
  testLocalStorage.clear();
  rs.clearAllMocks();
  rs.clearAllTimers();
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
  // React 18.3 installs a warning getter on `props.ref`; the CLI-installed registry Slot
  // (components/redpanda-ui/lib/base-ui-compat.tsx) reads it during asChild composition. Not
  // fixable here (vendored, CLI-managed) — fix upstream in the registry; resolves in React 19.
  /`ref` is not a prop/,
  // Radix DialogContent missing Description/aria-describedby — tracked separately for a11y
  /Missing `Description` or `aria-describedby=\{undefined\}` for \{DialogContent\}/,
  // happy-dom DOMException noise from unmocked fetch/script loads
  /DOMException.*AbortError/,
  /Failed to load script/,
  // Network noise from fetch attempts to mocked endpoints that aren't running
  /socket hang up/,
  /ECONNREFUSED/,
  /ECONNRESET/,
  // pages/consumers/group-details.tsx keeps its per-topic actions in the Accordion trigger,
  // which is itself a <button>. Needs an Accordion API for header-level actions to fix.
  // Matched on the phrase + the tag token because React logs it as a `%s ... <%s>` template.
  /cannot appear as a descendant of[\s\S]*<button>/,
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
