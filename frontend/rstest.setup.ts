// Copyright 2026 Redpanda Data, Inc.

import { afterAll, afterEach, expect, rs } from '@rstest/core';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import './src/utils/array-extensions';

import { cleanupTestHarness } from './tests/harness-cleanup';

expect.extend(jestDomMatchers);

const unexpectedRequests: Error[] = [];

function rejectUnexpectedRequest({ request }: { request: { method: string; url: string } }): never {
  const error = new Error(`Unexpected test request: ${request.method} ${request.url}`);
  unexpectedRequests.push(error);
  throw error;
}

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
        interceptor: {
          // WARNING: Only network traffic that escaped MSW reaches Happy DOM. Record failures even if the app catches them.
          beforeAsyncRequest: async ({ request }: { request: { method: string; url: string } }) =>
            rejectUnexpectedRequest({ request }),
          beforeSyncRequest: rejectUnexpectedRequest,
        },
      });
      Reflect.set(settings, 'disableJavaScriptFileLoading', true);
      Reflect.set(settings, 'disableCSSFileLoading', true);
      Reflect.set(settings, 'disableJavaScriptEvaluation', true);
    }
  }
}

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

// WARNING: Rstest installs Happy DOM Request and Response but leaves Node Headers; mixed constructors silently drop HTTP headers.
if (typeof window !== 'undefined') {
  alignFetchHeaders();
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

// WARNING: Unmount rendered trees before clearing query and router resources; otherwise live subscribers can restart work.
// WARNING: Do not import stores for global resets; it pins config bindings before per-file module fixtures are applied.
afterEach(async () => {
  cleanup();
  await cleanupTestHarness();
  window.localStorage.clear();
  rs.clearAllMocks();
  rs.clearAllTimers();
});

afterEach(() => {
  const errors = unexpectedRequests.splice(0);
  if (errors.length > 0) {
    throw new AggregateError(errors, errors.map((error) => error.message).join('\n'));
  }
});

const originalWarn = console.warn;
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
