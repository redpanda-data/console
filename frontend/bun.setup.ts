import { installGlobals } from '@miaskiewicz/turbo-dom/install';

import { afterEach, describe, expect, it, mock, test } from 'bun:test';

import './src/utils/array-extensions';

// Pure tests import UI modules without rendering them; their import-time browser reads still need a host.
const nativeApis = {
  atob,
  btoa,
  fetch,
  Request,
  Response,
  Headers,
  URL,
  URLSearchParams,
  AbortController,
  AbortSignal,
  Blob,
  File,
  FormData,
  ReadableStream,
  WritableStream,
  TransformStream,
};
installGlobals(globalThis, { url: 'http://localhost:3000' });
// Keep Bun's networking constructors and the base64 APIs Turbo DOM delegates to.
Object.assign(globalThis, nativeApis);
Object.assign(globalThis, { describe, expect, it, test });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mock.clearAllMocks();
});
