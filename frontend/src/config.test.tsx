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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { config, createAuthInjectingFetch } from './config';

describe('createAuthInjectingFetch', () => {
  const ok = new Response(null, { status: 200 });
  let originalJwt: string | undefined;

  beforeEach(() => {
    originalJwt = config.jwt;
  });

  afterEach(() => {
    config.jwt = originalJwt;
  });

  test('attaches the Bearer token from config.jwt when no Authorization header is present', async () => {
    config.jwt = 'token-123';
    const baseFetch = vi.fn().mockResolvedValue(ok);

    await createAuthInjectingFetch(baseFetch)('/api/schema-registry/subjects/x/versions/latest/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(baseFetch).toHaveBeenCalledTimes(1);
    const [input, init] = baseFetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(input).toBe('/api/schema-registry/subjects/x/versions/latest/validate');
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    // existing init is preserved
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });

  test('does not overwrite an Authorization header a host-provided (V1) fetch already set', async () => {
    config.jwt = 'token-123';
    const baseFetch = vi.fn().mockResolvedValue(ok);

    await createAuthInjectingFetch(baseFetch)('/api/topics', {
      headers: { Authorization: 'Bearer host-token' },
    });

    const headers = new Headers(baseFetch.mock.calls[0][1].headers);
    expect(headers.get('Authorization')).toBe('Bearer host-token');
  });

  test('adds no Authorization header when config.jwt is unset (standalone OSS)', async () => {
    config.jwt = undefined;
    const baseFetch = vi.fn().mockResolvedValue(ok);

    await createAuthInjectingFetch(baseFetch)('/api/topics');

    const headers = new Headers(baseFetch.mock.calls[0][1].headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  test('reads config.jwt lazily at call time so token refreshes are picked up', async () => {
    config.jwt = 'old-token';
    const baseFetch = vi.fn().mockResolvedValue(ok);
    const authFetch = createAuthInjectingFetch(baseFetch);

    config.jwt = 'refreshed-token';
    await authFetch('/api/topics');

    const headers = new Headers(baseFetch.mock.calls[0][1].headers);
    expect(headers.get('Authorization')).toBe('Bearer refreshed-token');
  });
});
