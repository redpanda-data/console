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

/**
 * Side-effect-free module for tracking and tearing down QueryClients and
 * routers created by the test harness.
 *
 * Kept separate from `src/test-utils.tsx` on purpose: that file transitively
 * imports `routeTree.gen` (and from there, nearly the whole app, including
 * `config` / `isEmbedded` / `isAdpEnabled` live bindings). Importing
 * `cleanupTestHarness` from here in `vitest.setup.integration.ts` avoids
 * pinning those bindings before any test file's `vi.mock('config', ...)`
 * has a chance to take effect.
 */

import type { QueryClient } from '@tanstack/react-query';

export const trackedQueryClients = new Set<QueryClient>();

export type TrackedRouter = { history: { destroy?: () => void } };
export const trackedRouters = new Set<TrackedRouter>();

/**
 * Registered teardowns for side-effects installed by the production code
 * (config.setup + state/ui installUISettingsSideEffects). These are populated
 * lazily by the test harness when the corresponding side-effect is installed,
 * and cleared on each afterEach().
 *
 * Kept as a plain set so the harness code itself doesn't have to import
 * `src/config` / `src/state/ui` eagerly; callers register teardowns as
 * functions.
 */
export const trackedTeardowns = new Set<() => void>();

export function registerTestTeardown(teardown: () => void): void {
  trackedTeardowns.add(teardown);
}

export async function cleanupTestHarness(): Promise<void> {
  const errors: unknown[] = [];
  const clients = [...trackedQueryClients];
  trackedQueryClients.clear();

  // Cancellation is asynchronous. Clearing a QueryClient before its active
  // ConnectRPC requests settle leaves their AbortSignal races and retry
  // promises alive after the test has finished.
  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.cancelQueries();
      } catch (error) {
        errors.push(error);
      }
    })
  );

  for (const client of clients) {
    try {
      client.clear();
      client.unmount();
    } catch (error) {
      errors.push(error);
    }
  }

  for (const router of trackedRouters) {
    try {
      router.history.destroy?.();
    } catch (error) {
      errors.push(error);
    }
  }
  trackedRouters.clear();

  for (const teardown of trackedTeardowns) {
    try {
      teardown();
    } catch (error) {
      errors.push(error);
    }
  }
  trackedTeardowns.clear();

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to clean up test harness resources');
  }
}
