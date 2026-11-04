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

import { Code, type ConnectError, createClient } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { ClusterFenceService, ClusterFenceState } from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';

import {
  createShadowBoxSimulatorTransport,
  resetShadowBoxSimulator,
  SHADOW_BOX_SIMULATOR_STORAGE_KEY,
  setShadowBoxSimulatorOptions,
} from './shadow-box-simulator';

/** Every simulated broker has picked up a Box by then: three brokers at 1.4 s each plus up to 0.6 s of jitter. */
const SETTLE_MS = 5000;

const client = () => createClient(ClusterFenceService, createShadowBoxSimulatorTransport('cluster-1'));

type SimulatorClient = ReturnType<typeof client>;

/**
 * Each call waits on the simulator's fake latency, so let timers run while it resolves. The outcome
 * is captured first, so a rejection during the advance isn't reported as unhandled.
 */
const call = async <T,>(promise: Promise<T>): Promise<T> => {
  const settled = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error })
  );
  await rs.advanceTimersByTimeAsync(250);
  const result = await settled;
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
};

const failure = (promise: Promise<unknown>) =>
  call(promise).then(
    () => {
      throw new Error('expected the call to fail');
    },
    (error: unknown) => error as ConnectError
  );

/** The status once another `ms` have passed. */
const statusAfter = async (shadowBox: SimulatorClient, ms: number) => {
  await rs.advanceTimersByTimeAsync(ms);
  return call(shadowBox.getClusterFenceStatus({}));
};

/** Saves `shadow-orders` as the only exempt principal, then boxes at the revision the save returned. */
const boxWithExemptPrincipal = async (shadowBox: SimulatorClient) => {
  const saved = await call(
    shadowBox.updateClusterFenceSettings({
      settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
      updateMask: { paths: ['read_policy'] },
    })
  );
  const boxing = await call(shadowBox.fence({ expectedRevision: saved.fence?.revision }));
  return { saved, boxing };
};

/** Boxes, waits until every broker has the box, then adds `shadow-orders` to the exempt principals. */
const reboxWithNewPrincipal = async (shadowBox: SimulatorClient) => {
  const boxing = await call(shadowBox.fence({}));
  await rs.advanceTimersByTimeAsync(SETTLE_MS);
  const reboxing = await call(
    shadowBox.updateClusterFenceSettings({
      settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
      updateMask: { paths: ['read_policy.exempt_principals'] },
    })
  );
  return { boxing, reboxing };
};

describe('fence simulator', () => {
  beforeEach(() => {
    rs.useFakeTimers();
    window.localStorage.removeItem(SHADOW_BOX_SIMULATOR_STORAGE_KEY);
    resetShadowBoxSimulator();
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  describe('the fence', () => {
    test('a cluster starts unfenced at revision -1, with no state change yet and default settings', async () => {
      const status = await call(client().getClusterFenceStatus({}));
      expect(status.fence?.state).toBe(ClusterFenceState.UNFENCED);
      expect(status.fence?.revision).toBe(-1n);
      expect(status.fence?.stateChangedAt).toBeUndefined();
      expect(status.fence?.settings?.readPolicy?.exemptPrincipals).toEqual([]);
      expect(status.brokers.map((broker) => broker.nodeId)).toEqual([1, 2, 3]);
    });

    test('a Fence returns at fencing, at a revision after the settings it fences with', async () => {
      const { saved, boxing } = await boxWithExemptPrincipal(client());
      expect(saved.fence?.state).toBe(ClusterFenceState.UNFENCED);
      expect(saved.fence?.revision).toBeGreaterThan(-1n);
      expect(boxing.fence?.state).toBe(ClusterFenceState.FENCING);
      expect(boxing.fence?.revision).toBeGreaterThan(saved.fence?.revision ?? 0n);
    });

    test('each broker blocks once it picks a Fence up', async () => {
      const shadowBox = client();
      const boxing = await call(shadowBox.fence({}));
      const partway = await statusAfter(shadowBox, 2200);
      expect(partway.fence?.state).toBe(ClusterFenceState.FENCING);
      const confirmed = partway.brokers.filter(
        (broker) =>
          broker.fence?.state === ClusterFenceState.FENCING && broker.fence.revision === boxing.fence?.revision
      );
      expect(confirmed.length).toBeGreaterThan(0);
      expect(confirmed.length).toBeLessThan(3);
    });

    test('the cluster is fenced, with the settings it fenced with, once every broker has picked the Fence up', async () => {
      const shadowBox = client();
      const { boxing } = await boxWithExemptPrincipal(shadowBox);
      const status = await statusAfter(shadowBox, SETTLE_MS);
      expect(status.fence?.state).toBe(ClusterFenceState.FENCED);
      expect(status.fence?.revision).toBe(boxing.fence?.revision);
      expect(status.fence?.settings?.readPolicy?.exemptPrincipals).toEqual(['shadow-orders']);
      expect(status.brokers.every((broker) => broker.fence?.state === ClusterFenceState.FENCED)).toBe(true);
    });

    test('revisions grow by uneven steps, never by a fixed count', async () => {
      const shadowBox = client();
      // Each change starts from the revision the last one left, so they run one after another.
      const revisions = await [true, false, true, false].reduce<Promise<bigint[]>>(
        async (earlier, allowAllReads) => {
          const seen = await earlier;
          const response = await call(
            shadowBox.updateClusterFenceSettings({
              settings: { readPolicy: { allowAllReads } },
              updateMask: { paths: ['read_policy'] },
            })
          );
          return [...seen, response.fence?.revision ?? 0n];
        },
        Promise.resolve([-1n])
      );
      const steps = revisions.slice(1).map((revision, index) => revision - (revisions[index] ?? 0n));
      expect(steps.every((step) => step >= 2n && step <= 10n)).toBe(true);
    });

    test('a Fence while fencing or fenced and an Unfence while unfenced change nothing', async () => {
      const shadowBox = client();
      const unboxed = await call(shadowBox.unfence({}));
      expect(unboxed.fence?.revision).toBe(-1n);

      const boxing = await call(shadowBox.fence({}));
      const again = await call(shadowBox.fence({}));
      expect(again.fence?.revision).toBe(boxing.fence?.revision);
    });

    test('a stale expected revision fails the way the broker does', async () => {
      const error = await failure(client().fence({ expectedRevision: 7n }));
      expect(error.code).toBe(Code.FailedPrecondition);
      expect(error.rawMessage).toBe('Cluster fence revision has changed');
    });
  });

  describe('down brokers', () => {
    test('a broker that is down holds the fence in fencing with an error, until it comes back', async () => {
      setShadowBoxSimulatorOptions({ downBrokers: [2] });
      const shadowBox = client();
      await call(shadowBox.fence({}));

      const held = await statusAfter(shadowBox, SETTLE_MS * 4);
      expect(held.fence?.state).toBe(ClusterFenceState.FENCING);
      expect(held.brokers[1]?.box).toBeUndefined();
      expect(held.brokers[1]?.errorMessage).toBeTruthy();

      setShadowBoxSimulatorOptions({ downBrokers: [] });
      const finished = await statusAfter(shadowBox, 1000);
      expect(finished.fence?.state).toBe(ClusterFenceState.FENCED);
    });

    test('a down broker holds Unfence too', async () => {
      const shadowBox = client();
      await call(shadowBox.fence({}));
      await rs.advanceTimersByTimeAsync(SETTLE_MS);
      setShadowBoxSimulatorOptions({ downBrokers: [3] });

      await call(shadowBox.unfence({}));
      const status = await statusAfter(shadowBox, SETTLE_MS * 4);
      expect(status.fence?.state).toBe(ClusterFenceState.UNFENCING);
    });
  });

  describe('settings', () => {
    test('new settings while fenced go back through fencing, and brokers keep blocking on their old copy', async () => {
      const shadowBox = client();
      const { boxing, reboxing } = await reboxWithNewPrincipal(shadowBox);
      expect(reboxing.fence?.state).toBe(ClusterFenceState.FENCING);

      const status = await call(shadowBox.getClusterFenceStatus({}));
      const behind = status.brokers.filter((broker) => broker.fence?.revision !== reboxing.fence?.revision);
      expect(behind.length).toBeGreaterThan(0);
      expect(
        behind.every(
          (broker) =>
            broker.fence?.state === ClusterFenceState.FENCED && broker.fence.revision === boxing.fence?.revision
        )
      ).toBe(true);
    });

    test('new settings while fenced leave the cluster fenced with them once every broker has them', async () => {
      const shadowBox = client();
      await reboxWithNewPrincipal(shadowBox);
      const boxed = await statusAfter(shadowBox, SETTLE_MS);
      expect(boxed.fence?.state).toBe(ClusterFenceState.FENCED);
      expect(boxed.fence?.settings?.readPolicy?.exemptPrincipals).toEqual(['shadow-orders']);
    });

    test('the exempt_principals mask only adds names; the read_policy mask replaces them', async () => {
      const shadowBox = client();
      await call(
        shadowBox.updateClusterFenceSettings({
          settings: { readPolicy: { exemptPrincipals: ['link-user'] } },
          updateMask: { paths: ['read_policy'] },
        })
      );
      const added = await call(
        shadowBox.updateClusterFenceSettings({
          settings: { readPolicy: { exemptPrincipals: ['new-user'], allowAllReads: true } },
          updateMask: { paths: ['read_policy.exempt_principals'] },
        })
      );
      expect(added.fence?.settings?.readPolicy).toMatchObject({
        exemptPrincipals: ['link-user', 'new-user'],
        allowAllReads: false,
      });

      const replaced = await call(
        shadowBox.updateClusterFenceSettings({
          settings: { readPolicy: { exemptPrincipals: ['new-user'] } },
          updateMask: { paths: ['read_policy'] },
        })
      );
      expect(replaced.fence?.settings?.readPolicy?.exemptPrincipals).toEqual(['new-user']);
    });

    test('an Unfence keeps the settings saved', async () => {
      const shadowBox = client();
      await call(
        shadowBox.updateClusterFenceSettings({
          settings: { readPolicy: { allowAllReads: true } },
          updateMask: { paths: ['read_policy'] },
        })
      );
      await call(shadowBox.fence({}));
      await rs.advanceTimersByTimeAsync(SETTLE_MS);
      await call(shadowBox.unfence({}));

      const status = await statusAfter(shadowBox, SETTLE_MS);
      expect(status.fence?.state).toBe(ClusterFenceState.UNFENCED);
      expect(status.fence?.settings?.readPolicy?.allowAllReads).toBe(true);
    });
  });

  describe('failures', () => {
    test.each(['feature-inactive', 'own-shadow-link', 'data-migration', 'cluster-recovery', 'read-replica'] as const)(
      'a Fence blocked by %s fails with FAILED_PRECONDITION',
      async (boxFailure) => {
        setShadowBoxSimulatorOptions({ boxFailure });
        const error = await failure(client().fence({}));
        expect(error.code).toBe(Code.FailedPrecondition);
      }
    );

    test('with no controller leader, the status and changes are UNAVAILABLE but each broker still answers for itself', async () => {
      setShadowBoxSimulatorOptions({ noLeader: true });
      const shadowBox = client();
      expect((await failure(shadowBox.getClusterFenceStatus({}))).code).toBe(Code.Unavailable);
      expect((await failure(shadowBox.fence({}))).code).toBe(Code.Unavailable);

      const broker = await call(shadowBox.getClusterFenceBrokerStatus({ nodeId: 2 }));
      expect(broker.broker?.nodeId).toBe(2);
      expect(broker.broker?.fence?.state).toBe(ClusterFenceState.UNFENCED);
    });

    test('the GetClusterFenceBrokerStatus call: a down broker is UNAVAILABLE, a broker that isn’t a member is NOT_FOUND', async () => {
      setShadowBoxSimulatorOptions({ downBrokers: [3] });
      const shadowBox = client();
      expect((await failure(shadowBox.getClusterFenceBrokerStatus({ nodeId: 3 }))).code).toBe(Code.Unavailable);
      expect((await failure(shadowBox.getClusterFenceBrokerStatus({ nodeId: 9 }))).code).toBe(Code.NotFound);
    });

    test('a slow call returns DEADLINE_EXCEEDED, yet the change still applies', async () => {
      setShadowBoxSimulatorOptions({ slowCalls: true });
      const shadowBox = client();
      expect((await failure(shadowBox.fence({}))).code).toBe(Code.DeadlineExceeded);

      setShadowBoxSimulatorOptions({ slowCalls: false });
      const status = await call(shadowBox.getClusterFenceStatus({}));
      expect(status.fence?.state).toBe(ClusterFenceState.FENCING);
    });
  });

  test.each([
    ['version 1', { version: 1, enabled: true, options: {}, clusters: { 'cluster-1': { target: 'boxed' } } }],
    [
      'version 2, from before ClusterFenceService',
      {
        version: 2,
        enabled: true,
        options: {},
        clusters: {
          'cluster-1': {
            box: { state: 'SHADOW_BOX_STATE_BOXED', revision: '4', stateChangedAt: null, settings: {} },
            brokers: {},
          },
        },
      },
    ],
  ])('a record from an older simulator (%s) is ignored', async (_, record) => {
    window.localStorage.setItem(SHADOW_BOX_SIMULATOR_STORAGE_KEY, JSON.stringify(record));
    const status = await call(client().getClusterFenceStatus({}));
    expect(status.fence?.state).toBe(ClusterFenceState.UNFENCED);
  });
});
