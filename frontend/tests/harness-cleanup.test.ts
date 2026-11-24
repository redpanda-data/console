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

import { isCancelledError, QueryClient } from '@tanstack/react-query';
import { createBrowserHistory } from '@tanstack/react-router';

import { cleanupTestHarness, trackedQueryClients, trackedRouters, trackedTeardowns } from './harness-cleanup';
import { describe, expect, test } from 'bun:test';

const activeKey = ['active-request'];

function launchActiveQuery(client: QueryClient) {
  const finished = Promise.withResolvers<void>();
  const query = client.fetchQuery({
    queryKey: activeKey,
    queryFn: ({ signal }) => {
      signal.addEventListener('abort', () => finished.reject(signal.reason), { once: true });
      return finished.promise;
    },
  });
  return query.catch((error: unknown) => error);
}

function trackResources() {
  const client = new QueryClient();
  client.mount();
  const result = launchActiveQuery(client);
  const { pushState } = window.history;
  const history = createBrowserHistory();
  const teardown = new AbortController();

  trackedQueryClients.add(client);
  trackedRouters.add({ history });
  trackedTeardowns.add(() => teardown.abort());

  return { client, result, pushState, history, teardown };
}

async function expectRelease({ client, result, pushState, teardown }: ReturnType<typeof trackResources>) {
  expect(isCancelledError(await result)).toBe(true);
  expect(client.getQueryState(activeKey)).toBeUndefined();
  expect(window.history.pushState).toBe(pushState);
  expect(teardown.signal.aborted).toBe(true);
  expect(trackedQueryClients).toHaveLength(0);
  expect(trackedRouters).toHaveLength(0);
  expect(trackedTeardowns).toHaveLength(0);
}

describe('cleanupTestHarness', () => {
  test('waits for query cancellation before releasing the cache, history and teardowns', async () => {
    const resources = trackResources();
    const cleanup = cleanupTestHarness();
    try {
      expect(resources.client.getQueryState(activeKey)).toBeDefined();
      expect(window.history.pushState).not.toBe(resources.pushState);
      expect(resources.teardown.signal.aborted).toBe(false);
    } finally {
      await cleanup;
    }
    await expectRelease(resources);
  });

  test('runs every teardown and reports failures', async () => {
    const firstError = new Error('first teardown failed');
    const secondError = new Error('second teardown failed');
    const teardown = new AbortController();

    trackedTeardowns.add(() => {
      throw firstError;
    });
    trackedTeardowns.add(() => {
      throw secondError;
    });
    trackedTeardowns.add(() => teardown.abort());

    await expect(cleanupTestHarness()).rejects.toMatchObject({
      errors: [firstError, secondError],
    });
    expect(teardown.signal.aborted).toBe(true);
    expect(trackedTeardowns).toHaveLength(0);
  });
});
