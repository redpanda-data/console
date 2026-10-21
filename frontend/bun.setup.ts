import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { afterEach, describe, expect, it, mock, test } from 'bun:test';

import './src/utils/array-extensions';

// Pure tests import UI modules without rendering them; their import-time browser reads still need a host.
const nativeNetworking = {
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
GlobalRegistrator.register({ url: 'http://localhost:3000' });
// DOM registration must not change the transport/constructor identity of Bun's networking stack.
Object.assign(globalThis, nativeNetworking);
Object.assign(globalThis, { describe, expect, it, test });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mock.clearAllMocks();
});
