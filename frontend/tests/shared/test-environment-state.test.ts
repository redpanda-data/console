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

import {
  cleanupSerializedResources,
  cleanupStartedResources,
  createEnvironmentState,
  rememberContainer,
  serializeEnvironmentState,
  withSetupRollback,
} from './test-environment-state.mjs';
import { describe, expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function createWorkspace() {
  const root = await mkdtemp(join(tmpdir(), 'console-env-cleanup-'));
  onTestFinished(async () => {
    await rm(root, { force: true, recursive: true });
  });
  return root;
}

async function createResourceDirectory(root: string, key: string) {
  const path = join(root, key);
  await mkdir(path);
  return path;
}

const removeResource = (path: string) => rm(path, { recursive: true });

function directoryHandle(path: string, mayRemove?: Promise<void>) {
  let stopping = false;
  return {
    getId: () => path,
    isStopping: () => stopping,
    stop: async () => {
      stopping = true;
      await mayRemove;
      await removeResource(path);
    },
  };
}

async function stageParallelCleanup() {
  const root = await createWorkspace();
  const paths = await Promise.all(
    ['redpanda', 'backend', 'network'].map((name) => createResourceDirectory(root, name))
  );
  const canRemoveRedpanda = Promise.withResolvers<void>();
  const redpanda = directoryHandle(paths[0], canRemoveRedpanda.promise);
  const backend = directoryHandle(paths[1]);
  const network = directoryHandle(paths[2]);
  const state = Object.assign(createEnvironmentState(), { network });
  rememberContainer(state, 'redpanda', redpanda);
  rememberContainer(state, 'backend', backend);
  return { state, redpanda, backend, network, paths, releaseRedpanda: canRemoveRedpanda.resolve };
}

describe('test environment state', () => {
  test('rolls back after setup fails and reports both failures in order', async () => {
    const root = await createWorkspace();
    const temp = await createResourceDirectory(root, 'temp');
    const retained = await createResourceDirectory(root, 'retained');
    await writeFile(join(retained, 'manifest'), 'active');
    const session = join(root, 'missing-auth-directory', 'user.json');

    await expect(
      withSetupRollback(
        () => writeFile(session, '{}'),
        async () => {
          await removeResource(temp);
          await rmdir(retained);
        },
        'Test setup and cleanup failed'
      )
    ).rejects.toMatchObject({
      message: 'Test setup and cleanup failed',
      errors: [
        { code: 'ENOENT', path: session },
        { code: 'ENOTEMPTY', path: retained },
      ],
    });
    expect(existsSync(temp)).toBe(false);
  });

  test('tracks and serializes source and destination backends independently', async () => {
    const root = await createWorkspace();
    const [source, destination] = await Promise.all(
      ['source', 'destination'].map((name) => createResourceDirectory(root, name))
    );
    const state = createEnvironmentState();
    rememberContainer(state, 'sourceBackend', directoryHandle(source));
    rememberContainer(state, 'backend', directoryHandle(destination));

    const serialized = serializeEnvironmentState(state);
    expect(serialized).toMatchObject({ sourceBackendId: source, backendId: destination });
    expect(Object.keys(serialized).filter((key) => key.endsWith('Container'))).toEqual([]);
    await cleanupStartedResources(state);
    expect([source, destination].filter(existsSync)).toEqual([]);
  });

  test('stops containers in parallel before removing the network', async () => {
    const { state, redpanda, backend, network, paths, releaseRedpanda } = await stageParallelCleanup();
    const cleanup = cleanupStartedResources(state);
    try {
      expect(redpanda.isStopping()).toBe(true);
      expect(backend.isStopping()).toBe(true);
      expect(network.isStopping()).toBe(false);
      expect(existsSync(paths[0])).toBe(true);
    } finally {
      releaseRedpanda();
      await cleanup;
    }
    expect(paths.filter(existsSync)).toEqual([]);
  });

  test('attempts all cleanup and reports failures', async () => {
    const root = await createWorkspace();
    const backend = await createResourceDirectory(root, 'backend');
    const missingRedpanda = join(root, 'missing-redpanda');
    const missingNetwork = join(root, 'missing-network');
    const state = Object.assign(createEnvironmentState(), { network: directoryHandle(missingNetwork) });
    rememberContainer(state, 'redpanda', directoryHandle(missingRedpanda));
    rememberContainer(state, 'backend', directoryHandle(backend));

    await expect(cleanupStartedResources(state)).rejects.toMatchObject({
      errors: [
        { code: 'ENOENT', path: missingRedpanda },
        { code: 'ENOENT', path: missingNetwork },
      ],
    });
    expect(existsSync(backend)).toBe(false);
  });

  test('removes every serialized resource and temporary path after a crashed run', async () => {
    const root = await createWorkspace();
    const [networkId, redpandaId, backendId, ...tempPaths] = await Promise.all(
      ['network', 'redpanda', 'backend', 'license-one', 'license-two'].map((name) =>
        createResourceDirectory(root, name)
      )
    );
    const state = createEnvironmentState({ networkId, redpandaId, backendId, tempPaths });

    await cleanupSerializedResources(state, { removeContainer: removeResource, removeNetwork: removeResource });
    expect([networkId, redpandaId, backendId, ...tempPaths].filter(existsSync)).toEqual([]);
  });
});
