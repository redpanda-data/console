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

import { describe, expect, rs, test } from '@rstest/core';
import { QueryClient } from '@tanstack/react-query';

import { cleanupTestHarness, trackedQueryClients, trackedRouters, trackedTeardowns } from './harness-cleanup';

describe('cleanupTestHarness', () => {
  test('waits for query cancellation before clearing retained resources', async () => {
    const queryClient = new QueryClient();
    let finishCancellation: (() => void) | undefined;
    const cancelQueries = rs.spyOn(queryClient, 'cancelQueries').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCancellation = resolve;
        })
    );
    const clear = rs.spyOn(queryClient, 'clear');
    const unmount = rs.spyOn(queryClient, 'unmount');
    const destroyHistory = rs.fn();
    const teardown = rs.fn();

    trackedQueryClients.add(queryClient);
    trackedRouters.add({ history: { destroy: destroyHistory } });
    trackedTeardowns.add(teardown);

    const cleanup = cleanupTestHarness();

    expect(cancelQueries).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    expect(unmount).not.toHaveBeenCalled();

    finishCancellation?.();
    await cleanup;

    expect(clear).toHaveBeenCalledOnce();
    expect(unmount).toHaveBeenCalledOnce();
    expect(destroyHistory).toHaveBeenCalledOnce();
    expect(teardown).toHaveBeenCalledOnce();
    expect(trackedQueryClients).toHaveLength(0);
    expect(trackedRouters).toHaveLength(0);
    expect(trackedTeardowns).toHaveLength(0);
  });

  test('runs every teardown and reports failures', async () => {
    const firstError = new Error('first teardown failed');
    const secondError = new Error('second teardown failed');
    const finalTeardown = rs.fn();

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
    expect(finalTeardown).toHaveBeenCalledOnce();
    expect(trackedTeardowns).toHaveLength(0);
  });
});
