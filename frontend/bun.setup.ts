import { register } from '@ctrl/dom/register/pure';

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
register({ url: 'http://localhost:3000/', compat: 'modern', timeSkip: false });
// DOM registration must not replace Bun's native networking or base64 APIs.
Object.assign(globalThis, nativeApis);
Object.assign(globalThis, { describe, expect, it, test });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mock.clearAllMocks();
});
