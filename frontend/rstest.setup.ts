// Copyright 2026 Redpanda Data, Inc.

import { afterEach, beforeEach, expect, rs } from '@rstest/core';
import * as jestDomMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import './src/utils/array-extensions';
import './tests/mock-document';

import { cleanupTestHarness } from './tests/harness-cleanup';
import { createMemoryStorage } from './tests/memory-storage';

expect.extend(jestDomMatchers);

// Run DOM integration frames on the test clock without simulating display refresh.
globalThis.requestAnimationFrame = (callback) => Number(setTimeout(() => callback(performance.now()), 0));
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
// Turbo DOM's animate() stub never signals completion to Motion. Use Motion's JS fallback.
Reflect.deleteProperty(HTMLElement.prototype, 'animate');

// Turbo DOM implements TreeWalker but omits the constant Base UI passes for live regions.
if (typeof NodeFilter === 'undefined') {
  Object.defineProperty(globalThis, 'NodeFilter', { configurable: true, value: { SHOW_TEXT: 4 } });
}

// Turbo DOM does not clear focus when a focused element is removed.
const activeElement = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');
Object.defineProperty(Document.prototype, 'activeElement', {
  ...activeElement,
  get(this: Document) {
    const focused: Element | null = activeElement?.get?.call(this);
    return focused?.isConnected ? focused : this.body;
  },
});

// Base UI reads :focus-visible to show keyboard-triggered hints.
let keyboardFocus = true;
document.addEventListener(
  'keydown',
  () => {
    keyboardFocus = true;
  },
  true
);
document.addEventListener(
  'pointerdown',
  () => {
    keyboardFocus = false;
  },
  true
);
const {
  dispatchEvent: nativeDispatchEvent,
  matches: nativeMatches,
  querySelectorAll: nativeQuerySelectorAll,
} = Element.prototype;
Object.defineProperty(Element.prototype, 'matches', {
  ...Object.getOwnPropertyDescriptor(Element.prototype, 'matches'),
  value(this: Element, selector: string) {
    if (selector === ':focus-visible') {
      return keyboardFocus && this.ownerDocument.activeElement === this;
    }
    return nativeMatches.call(this, selector);
  },
});

// Registry's row focus uses NodeList.item(), which Turbo DOM's arrays lack.
Element.prototype.querySelectorAll = function querySelectorAll(this: Element, selector: string) {
  const nodes = nativeQuerySelectorAll.call(this, selector);
  if (!nodes.item) {
    Object.defineProperty(nodes, 'item', { value: (index: number) => nodes[index] ?? null });
  }
  return nodes;
};

// Turbo DOM submits ancestor forms only; Console's dialog submit buttons use form="…".
Element.prototype.dispatchEvent = function dispatchEvent(this: Element, event: Event) {
  const accepted = nativeDispatchEvent.call(this, event);
  if (accepted && event.type === 'click') {
    const button = this.closest<HTMLButtonElement>('button[type="submit"][form]');
    if (button && !button.disabled && !button.closest('form')) {
      const form = button.ownerDocument.getElementById(button.getAttribute('form') ?? '');
      if (form instanceof HTMLFormElement) {
        form.requestSubmit(button);
      }
    }
  }
  return accepted;
};

// React initializes textarea content through defaultValue, not the value attribute.
const defaultValue = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'defaultValue');
Object.defineProperty(HTMLElement.prototype, 'defaultValue', {
  ...defaultValue,
  get(this: HTMLElement) {
    return this.localName === 'textarea' ? this.textContent : defaultValue?.get?.call(this);
  },
  set(this: HTMLElement, value: string) {
    if (this.localName === 'textarea') {
      this.textContent = value;
    } else {
      defaultValue?.set?.call(this, value);
    }
  },
});

// Tests and Floating UI need rectangle values, not a layout engine.
globalThis.DOMRect ??= class TestDOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
  get top() {
    return Math.min(this.y, this.y + this.height);
  }
  get right() {
    return Math.max(this.x, this.x + this.width);
  }
  get bottom() {
    return Math.max(this.y, this.y + this.height);
  }
  get left() {
    return Math.min(this.x, this.x + this.width);
  }
  toJSON() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      top: this.top,
      right: this.right,
      bottom: this.bottom,
      left: this.left,
    };
  }
  static fromRect({ x, y, width, height }: DOMRectInit = {}) {
    return new TestDOMRect(x, y, width, height);
  }
};

const testLocalStorage = createMemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
});

const unexpectedRequests: Error[] = [];

// Record before rejecting: application error handling must not hide a missing fixture.
// Like the real fetch, failures reach the caller as a rejected promise, never as a synchronous throw.
if (typeof window !== 'undefined') {
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

// Base UI's ScrollAreaViewport calls getAnimations from a setTimeout.
if (typeof Element !== 'undefined' && typeof Element.prototype.getAnimations !== 'function') {
  Element.prototype.getAnimations = () => [];
}
if (typeof Document !== 'undefined' && typeof Document.prototype.getAnimations !== 'function') {
  Document.prototype.getAnimations = () => [];
}

// ── Mocks ────────────────────────────────────────────────────────────
// Keep prefers-color-scheme and responsive hook results deterministic.
beforeEach(() => {
  keyboardFocus = true;
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

afterEach(() => {
  const errors = unexpectedRequests.splice(0);
  if (errors.length > 0) {
    throw new AggregateError(errors, errors.map((error) => error.message).join('\n'));
  }
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
  // group-details.tsx nests its per-topic actions in the Accordion trigger's own <button>.
  // Matches phrase and tag separately: React logs it as a `%s ... <%s>` template.
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
