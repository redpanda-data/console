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

import { TokenManager } from './token-manager';
import { describe, expect, test } from 'bun:test';

describe('the TokenManager', () => {
  test('shares one in-flight refresh and clears its pending state on completion', async () => {
    const host = { token: Promise.withResolvers<string>(), requests: 0 };
    const manager = new TokenManager(() => {
      host.requests += 1;
      return host.token.promise;
    });

    expect(manager.isRefreshing).toBe(false);
    const pending = manager.refresh();
    expect(manager.refresh()).toBe(pending);
    expect({ refreshing: manager.isRefreshing, requests: host.requests }).toEqual({ refreshing: true, requests: 1 });
    host.token.resolve('host-token');
    await expect(pending).resolves.toBe('host-token');
    expect(manager.isRefreshing).toBe(false);
  });

  test('obtains a new token after a successful refresh', async () => {
    const hostTokens = ['first-token', 'second-token'].values();
    const manager = new TokenManager(() => {
      const response = hostTokens.next();
      if (response.done) {
        throw new Error('Unexpected token request');
      }
      return Promise.resolve(response.value);
    });
    await expect(manager.refresh()).resolves.toBe('first-token');
    await expect(manager.refresh()).resolves.toBe('second-token');
  });

  test('propagates the host error and releases in-flight state for a retry', async () => {
    const first = Promise.withResolvers<string>();
    const error = new Error('Token service unavailable');
    const manager = new TokenManager(() => first.promise);

    const pending = manager.refresh();
    first.reject(error);
    await expect(pending).rejects.toBe(error);
    expect(manager.isRefreshing).toBe(false);

    manager.setGetAccessToken(() => Promise.resolve('retry-token'));
    await expect(manager.refresh()).resolves.toBe('retry-token');
  });

  test('clears pending state immediately on reset and rejects the late token', async () => {
    const token = Promise.withResolvers<string>();
    const manager = new TokenManager(() => token.promise);

    const pending = manager.refresh();
    manager.reset();
    expect(manager.isRefreshing).toBe(false);

    token.resolve('stale-token');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('never commits a retired token or clears the replacement refresh', async () => {
    const { manager, committed, retired, current, stale, replacement } = startReplacementRefresh();

    retired.resolve('stale-token');
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    expect(committed).toEqual([]);
    expect(manager.isRefreshing).toBe(true);
    expect(manager.refresh()).toBe(replacement);

    current.resolve('current-token');
    await expect(replacement).resolves.toBe('current-token');
    expect(committed).toEqual(['current-token']);
  });

  test('can be reset repeatedly when idle and still refreshes', async () => {
    const manager = new TokenManager(() => Promise.resolve('current-token'));
    manager.reset();
    manager.reset();
    expect(manager.isRefreshing).toBe(false);
    await expect(manager.refresh()).resolves.toBe('current-token');
  });
});

function startReplacementRefresh() {
  const retired = Promise.withResolvers<string>();
  const current = Promise.withResolvers<string>();
  const committed: string[] = [];
  const manager = new TokenManager(
    () => retired.promise,
    (token) => committed.push(token)
  );

  const stale = manager.refresh();
  manager.reset();
  manager.setGetAccessToken(() => current.promise);
  const replacement = manager.refresh();
  return { manager, committed, retired, current, stale, replacement };
}
