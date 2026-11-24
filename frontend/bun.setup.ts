import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { afterEach, describe, expect, it, mock, test } from 'bun:test';

import './src/utils/array-extensions';

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
// WARNING: Restore Bun networking after DOM registration; replaced constructors break native request identity.
Object.assign(globalThis, nativeNetworking);
Object.assign(globalThis, { describe, expect, it, test });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mock.clearAllMocks();
});
