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

import { QueryClient } from '@tanstack/react-query';

import { cleanupTestHarness, trackedQueryClients, trackedRouters, trackedTeardowns } from './harness-cleanup';
import { describe, expect, mock, spyOn, test } from 'bun:test';

describe('cleanupTestHarness', () => {
  test('waits for query cancellation before clearing retained resources', async () => {
    const queryClient = new QueryClient();
    let finishCancellation: (() => void) | undefined;
    const cancelQueries = spyOn(queryClient, 'cancelQueries').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCancellation = resolve;
        })
    );
    const clear = spyOn(queryClient, 'clear');
    const unmount = spyOn(queryClient, 'unmount');
    const destroyHistory = mock();
    const teardown = mock();

    trackedQueryClients.add(queryClient);
    trackedRouters.add({ history: { destroy: destroyHistory } });
    trackedTeardowns.add(teardown);

    const cleanup = cleanupTestHarness();

    expect(cancelQueries).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(unmount).not.toHaveBeenCalled();

    finishCancellation?.();
    await cleanup;

    expect(clear).toHaveBeenCalledTimes(1);
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(destroyHistory).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(trackedQueryClients).toHaveLength(0);
    expect(trackedRouters).toHaveLength(0);
    expect(trackedTeardowns).toHaveLength(0);
  });

  test('runs every teardown and reports failures', async () => {
    const firstError = new Error('first teardown failed');
    const secondError = new Error('second teardown failed');
    const finalTeardown = mock();

    trackedTeardowns.add(() => {
      throw firstError;
    });
    trackedTeardowns.add(() => {
      throw secondError;
    });
    trackedTeardowns.add(finalTeardown);

    await expect(cleanupTestHarness()).rejects.toMatchObject({
      errors: [firstError, secondError],
    });
    expect(finalTeardown).toHaveBeenCalledTimes(1);
    expect(trackedTeardowns).toHaveLength(0);
  });
});
