// Copyright 2026 Redpanda Data, Inc.

import { afterAll, afterEach, beforeEach, expect, rs } from '@rstest/core';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import './src/utils/array-extensions';
import './tests/mock-document';

import { cleanupTestHarness } from './tests/harness-cleanup';
import { createMemoryStorage } from './tests/memory-storage';

expect.extend(jestDomMatchers);

// WARNING: Use worker-owned storage; Node can expose undefined localStorage when no --localstorage-file is provided.
const testLocalStorage = createMemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
});
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
});

// WARNING: Keep Happy DOM resource loading disabled; implicit script and CSS loads can reach the network outside the fetch guard.
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

const unexpectedRequests: Error[] = [];

function alignFetchHeaders() {
  const browserHeaders = new Request(window.location.href).headers.constructor;
  if (browserHeaders === Headers) {
    return;
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Headers');
  Object.defineProperty(globalThis, 'Headers', {
    configurable: true,
    writable: true,
    value: browserHeaders,
  });
  afterAll(() => {
    if (original) {
      Object.defineProperty(globalThis, 'Headers', original);
    } else {
      Reflect.deleteProperty(globalThis, 'Headers');
    }
  });
}

// WARNING: Record unexpected requests before rejecting fetch asynchronously; application catches must not conceal missing handlers.
if (typeof window !== 'undefined') {
  // WARNING: Rstest installs happy-dom Request and Response but leaves Node Headers; mixed constructors silently drop HTTP headers.
  alignFetchHeaders();
  globalThis.fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const isRequest = typeof input !== 'string' && !(input instanceof URL);
        const url = isRequest ? input.url : input.toString();
        const method = init?.method ?? (isRequest ? input.method : 'GET');
        const error = new Error(`Unexpected test request: ${method} ${new URL(url, window.location.href).href}`);
        unexpectedRequests.push(error);
        reject(error);
      }),
    globalThis.fetch
  );
}

// WARNING: Keep getAnimations available; Base UI calls it asynchronously even where Happy DOM does not implement it.
if (typeof Element !== 'undefined' && typeof Element.prototype.getAnimations !== 'function') {
  Element.prototype.getAnimations = () => [];
}
if (typeof Document !== 'undefined' && typeof Document.prototype.getAnimations !== 'function') {
  Document.prototype.getAnimations = () => [];
}

// WARNING: Handle finished before cancelling; Happy DOM cancellation can otherwise reject with an unhandled AbortError (#2412).
if (typeof Animation !== 'undefined') {
  const originalCancel = Animation.prototype.cancel;
  Animation.prototype.cancel = function cancel(this: Animation) {
    this.finished.catch(() => undefined);
    originalCancel.call(this);
  };
}

// WARNING: Keep baseline media queries deterministic; ambient color scheme and viewport matches make integration tests order-dependent.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: rs.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: rs.fn(),
      removeListener: rs.fn(),
      addEventListener: rs.fn(),
      removeEventListener: rs.fn(),
      dispatchEvent: rs.fn(),
    })),
  });
});

// WARNING: Lottie animation frames can outlive the test even if canvas is stubbed; remove the fixture only with real teardown.
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

// WARNING: Unmount rendered trees before clearing query and router resources; otherwise live subscribers can restart work.
// WARNING: Do not import stores for global resets; it pins config bindings before per-file module fixtures are applied.
afterEach(async () => {
  cleanup();
  await cleanupTestHarness();
  testLocalStorage.clear();
  rs.clearAllMocks();
  rs.clearAllTimers();
});

afterEach(() => {
  const errors = unexpectedRequests.splice(0);
  if (errors.length > 0) {
    throw new AggregateError(errors, errors.map((error) => error.message).join('\n'));
  }
});

// biome-ignore lint/suspicious/noConsole: test setup needs to intercept console for warning suppression
const originalWarn = console.warn;
// biome-ignore lint/suspicious/noConsole: test setup needs to intercept console for warning suppression
const originalError = console.error;

const SUPPRESSED_PATTERNS = [
  // WARNING: Keep the warning filter narrow: group-details has nested buttons, and React supplies the tag in a later format argument.
  /cannot appear as a descendant of[\s\S]*<button>/u,
];

function isSuppressed(args: unknown[]) {
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
