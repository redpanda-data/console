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

export function registerTestTeardown(teardown: () => void) {
  trackedTeardowns.add(teardown);
}

function collectFailure(errors: unknown[], operation: () => void) {
  try {
    operation();
  } catch (error) {
    errors.push(error);
  }
}

// WARNING: Await query cancellation before clearing clients; active Connect requests and retries can otherwise outlive the test.
async function cancelQueries(clients: QueryClient[], errors: unknown[]) {
  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.cancelQueries();
      } catch (error) {
        errors.push(error);
      }
    })
  );
}

function releaseQueryClients(clients: QueryClient[], errors: unknown[]) {
  for (const client of clients) {
    collectFailure(errors, () => {
      client.clear();
      client.unmount();
    });
  }
}

function destroyTrackedRouters(errors: unknown[]) {
  for (const router of trackedRouters) {
    collectFailure(errors, () => router.history.destroy?.());
  }
  trackedRouters.clear();
}

function runTrackedTeardowns(errors: unknown[]) {
  for (const teardown of trackedTeardowns) {
    collectFailure(errors, teardown);
  }
  trackedTeardowns.clear();
}

/**
 * Import this module from runner setup, not the render helpers, which import the application route graph eagerly. Cancels queries before releasing clients and routers.
 */
export async function cleanupTestHarness() {
  const errors: unknown[] = [];
  const clients = [...trackedQueryClients];
  trackedQueryClients.clear();

  await cancelQueries(clients, errors);
  releaseQueryClients(clients, errors);
  destroyTrackedRouters(errors);
  runTrackedTeardowns(errors);

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to clean up test harness resources');
  }
}
