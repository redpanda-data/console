import { GlobalWindow, PropertySymbol } from 'happy-dom';

import { afterEach, describe, expect, it, mock, test } from 'bun:test';

import './src/utils/array-extensions';

const nativeGlobals = new Set([
  'constructor',
  'undefined',
  'NaN',
  'global',
  'globalThis',
  'fetch',
  'Request',
  'Response',
  'Headers',
  'URL',
  'URLSearchParams',
  'AbortController',
  'AbortSignal',
  'Blob',
  'File',
  'FormData',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
]);

function installDomProperty(dom: GlobalWindow, key: PropertyKey) {
  if (typeof key === 'string' && nativeGlobals.has(key)) {
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(dom, key);
  if (!descriptor || Object.getOwnPropertyDescriptor(globalThis, key)?.configurable === false) {
    return;
  }
  if (descriptor.value === dom) {
    descriptor.value = globalThis;
  }
  Object.defineProperty(globalThis, key, { ...descriptor, configurable: true });
}

function installDomGlobals() {
  const dom = new GlobalWindow({ url: 'http://localhost:3000', console });
  for (const key of Reflect.ownKeys(dom)) {
    installDomProperty(dom, key);
  }
  Reflect.set(dom.document, PropertySymbol.defaultView, globalThis);
}

// WARNING: Preserve Bun networking at installation time; mixed constructors break native request identity.
installDomGlobals();
Object.assign(globalThis, { describe, expect, it, test });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mock.clearAllMocks();
});
