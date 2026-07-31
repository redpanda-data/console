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

import { describe, expect, test, vi } from 'vitest';

import {
  cleanupSerializedResources,
  cleanupStartedResources,
  createEnvironmentState,
  rememberContainer,
} from './test-environment-state.mjs';

describe('test environment state', () => {
  test('tracks source and destination backends independently', () => {
    const state = createEnvironmentState();
    const sourceBackend = { getId: () => 'source-id' };
    const destinationBackend = { getId: () => 'destination-id' };

    rememberContainer(state, 'sourceBackend', sourceBackend);
    rememberContainer(state, 'backend', destinationBackend);

    expect(state.sourceBackendId).toBe('source-id');
    expect(state.sourceBackendContainer).toBe(sourceBackend);
    expect(state.backendId).toBe('destination-id');
    expect(state.backendContainer).toBe(destinationBackend);
  });

  test('stops containers in parallel before removing the network', async () => {
    const state = createEnvironmentState();
    let finishFirst: (() => void) | undefined;
    const firstStop = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        })
    );
    const secondStop = vi.fn().mockResolvedValue(undefined);
    const networkStop = vi.fn().mockResolvedValue(undefined);

    rememberContainer(state, 'redpanda', { getId: () => 'redpanda-id', stop: firstStop });
    rememberContainer(state, 'backend', { getId: () => 'backend-id', stop: secondStop });
    state.network = { stop: networkStop };

    const cleanup = cleanupStartedResources(state);

    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
    expect(networkStop).not.toHaveBeenCalled();

    finishFirst?.();
    await cleanup;

    expect(networkStop).toHaveBeenCalledOnce();
  });

  test('attempts all cleanup and reports failures', async () => {
    const state = createEnvironmentState();
    const firstError = new Error('first stop failed');
    const secondStop = vi.fn().mockResolvedValue(undefined);
    const networkStop = vi.fn().mockRejectedValue(new Error('network stop failed'));

    rememberContainer(state, 'redpanda', {
      getId: () => 'redpanda-id',
      stop: vi.fn().mockRejectedValue(firstError),
    });
    rememberContainer(state, 'backend', { getId: () => 'backend-id', stop: secondStop });
    state.network = { stop: networkStop };

    await expect(cleanupStartedResources(state)).rejects.toMatchObject({
      errors: [firstError, expect.objectContaining({ message: 'network stop failed' })],
    });
    expect(secondStop).toHaveBeenCalledOnce();
    expect(networkStop).toHaveBeenCalledOnce();
  });

  test('removes every serialized resource and temporary path after a crashed run', async () => {
    const state = createEnvironmentState({
      networkId: 'network-id',
      redpandaId: 'redpanda-id',
      backendId: 'backend-id',
      tempPaths: ['/tmp/license-one', '/tmp/license-two'],
    });
    const removeContainer = vi.fn().mockResolvedValue(undefined);
    const removeNetwork = vi.fn().mockResolvedValue(undefined);
    const removePath = vi.fn().mockResolvedValue(undefined);

    await cleanupSerializedResources(state, {
      removeContainer,
      removeNetwork,
      removePath,
    });

    expect(removeContainer).toHaveBeenCalledTimes(2);
    expect(removeContainer).toHaveBeenCalledWith('redpanda-id');
    expect(removeContainer).toHaveBeenCalledWith('backend-id');
    expect(removeNetwork).toHaveBeenCalledWith('network-id');
    expect(removePath).toHaveBeenCalledTimes(2);
  });
});
