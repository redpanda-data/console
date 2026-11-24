/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { afterAll, afterEach, beforeAll, expect, test } from '@rstest/core';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';

import { config, createAuthInjectingFetch } from './config';

const VALIDATE_URL = 'https://console.test/api/schema-registry/subjects/orders/versions/latest/validate';
const TOPICS_URL = 'https://console.test/api/topics';
const originalJwt = config.jwt;
const guardedFetch = globalThis.fetch;
const server = setupServer();

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the auth fetch test');
    },
  });
});

afterEach(() => {
  server.resetHandlers();
  config.jwt = originalJwt;
});

afterAll(() => {
  server.close();
});

function observeSchemaValidationRequests() {
  const requests: { authorization: string | null; contentType: string | null; body: unknown }[] = [];
  server.use(
    http.post(VALIDATE_URL, async ({ request }) => {
      requests.push({
        authorization: request.headers.get('Authorization'),
        contentType: request.headers.get('Content-Type'),
        body: await request.json(),
      });
      return HttpResponse.json({ isValid: true });
    })
  );
  return requests;
}

const validationRequest = (schema: string) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ schema }),
});

test('sends intact JSON requests with the current token even after it rotates', async () => {
  const requests = observeSchemaValidationRequests();
  config.jwt = 'first-token';
  const send = createAuthInjectingFetch(globalThis.fetch);
  expect((await send(VALIDATE_URL, validationRequest('"string"'))).ok).toBe(true);

  config.jwt = 'refreshed-token';
  expect((await send(VALIDATE_URL, validationRequest('"long"'))).ok).toBe(true);

  expect(requests).toEqual([
    { authorization: 'Bearer first-token', contentType: 'application/json', body: { schema: '"string"' } },
    { authorization: 'Bearer refreshed-token', contentType: 'application/json', body: { schema: '"long"' } },
  ]);
});

test.each([
  { label: 'preserves a caller-supplied authorization header', jwt: 'console-token', supplied: 'Bearer host-token' },
  { label: 'does not attach credentials in standalone mode', jwt: undefined, supplied: null },
])('$label', async ({ jwt, supplied }) => {
  const observed: (string | null)[] = [];
  server.use(
    http.get(TOPICS_URL, ({ request }) => {
      observed.push(request.headers.get('Authorization'));
      return HttpResponse.json({ topics: [] });
    })
  );
  config.jwt = jwt;
  const send = createAuthInjectingFetch(globalThis.fetch);

  await send(TOPICS_URL, { headers: supplied ? { Authorization: supplied } : {} });

  expect(observed).toEqual([supplied]);
});
