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

export function cleanupTestHarness(): void {
  for (const client of trackedQueryClients) {
    client.cancelQueries();
    client.clear();
    client.unmount();
  }
  trackedQueryClients.clear();

  for (const router of trackedRouters) {
    router.history.destroy?.();
  }
  trackedRouters.clear();
}
