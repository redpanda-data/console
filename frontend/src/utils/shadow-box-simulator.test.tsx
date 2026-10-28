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
import { ShadowBoxService } from 'protogen/redpanda/api/console/v1alpha1/shadowbox_pb';
import { ShadowBoxState } from 'protogen/redpanda/core/admin/v2/shadow_box_pb';

import {
  createShadowBoxSimulatorTransport,
  resetShadowBoxSimulator,
  SHADOW_BOX_SIMULATOR_STORAGE_KEY,
  setShadowBoxSimulatorOptions,
} from './shadow-box-simulator';

/** Every simulated broker has picked up a Box by then: three brokers at 1.4 s each plus up to 0.6 s of jitter. */
const SETTLE_MS = 5000;

const client = () => createClient(ShadowBoxService, createShadowBoxSimulatorTransport('cluster-1'));

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

describe('shadow box simulator', () => {
  beforeEach(() => {
    rs.useFakeTimers();
    window.localStorage.removeItem(SHADOW_BOX_SIMULATOR_STORAGE_KEY);
    resetShadowBoxSimulator();
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  test('a cluster starts unboxed at revision -1, with no state change yet and default settings', async () => {
    const status = await call(client().getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.UNBOXED);
    expect(status.box?.revision).toBe(-1n);
    expect(status.box?.stateChangedAt).toBeUndefined();
    expect(status.box?.settings?.readPolicy?.exemptPrincipals).toEqual([]);
    expect(status.brokers.map((broker) => broker.nodeId)).toEqual([1, 2, 3]);
  });

  test('a Box returns at boxing; each broker blocks once it picks it up, and the cluster is boxed once all have', async () => {
    const shadowBox = client();
    const saved = await call(
      shadowBox.updateShadowBoxSettings({
        settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
        updateMask: { paths: ['read_policy'] },
      })
    );
    expect(saved.box?.state).toBe(ShadowBoxState.UNBOXED);
    expect(saved.box?.revision).toBeGreaterThan(-1n);

    const boxing = await call(shadowBox.box({ expectedRevision: saved.box?.revision }));
    expect(boxing.box?.state).toBe(ShadowBoxState.BOXING);
    expect(boxing.box?.revision).toBeGreaterThan(saved.box?.revision ?? 0n);

    await rs.advanceTimersByTimeAsync(2200);
    const partway = await call(shadowBox.getShadowBoxStatus({}));
    expect(partway.box?.state).toBe(ShadowBoxState.BOXING);
    const confirmed = partway.brokers.filter(
      (broker) => broker.box?.state === ShadowBoxState.BOXING && broker.box.revision === boxing.box?.revision
    );
    expect(confirmed.length).toBeGreaterThan(0);
    expect(confirmed.length).toBeLessThan(3);

    await rs.advanceTimersByTimeAsync(SETTLE_MS);
    const status = await call(shadowBox.getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.BOXED);
    expect(status.box?.revision).toBe(boxing.box?.revision);
    expect(status.box?.settings?.readPolicy?.exemptPrincipals).toEqual(['shadow-orders']);
    expect(status.brokers.every((broker) => broker.box?.state === ShadowBoxState.BOXED)).toBe(true);
  });

  test('revisions grow by uneven steps, never by a fixed count', async () => {
    const shadowBox = client();
    const revisions: bigint[] = [-1n];
    for (const allowAllReads of [true, false, true, false]) {
      const response = await call(
        shadowBox.updateShadowBoxSettings({
          settings: { readPolicy: { allowAllReads } },
          updateMask: { paths: ['read_policy'] },
        })
      );
      revisions.push(response.box?.revision ?? 0n);
    }
    const steps = revisions.slice(1).map((revision, index) => revision - (revisions[index] ?? 0n));
    expect(steps.every((step) => step >= 2n && step <= 10n)).toBe(true);
  });

  test('a Box while boxing or boxed and an Unbox while unboxed change nothing', async () => {
    const shadowBox = client();
    const unboxed = await call(shadowBox.unbox({}));
    expect(unboxed.box?.revision).toBe(-1n);

    const boxing = await call(shadowBox.box({}));
    const again = await call(shadowBox.box({}));
    expect(again.box?.revision).toBe(boxing.box?.revision);
  });

  test('a stale expected revision fails the way the broker does', async () => {
    const error = await failure(client().box({ expectedRevision: 7n }));
    expect(error.code).toBe(Code.FailedPrecondition);
    expect(error.rawMessage).toBe('Shadow boxing revision has changed');
  });

  test('a broker that is down holds the box in boxing with an error, until it comes back', async () => {
    setShadowBoxSimulatorOptions({ downBrokers: [2] });
    const shadowBox = client();
    await call(shadowBox.box({}));
    await rs.advanceTimersByTimeAsync(SETTLE_MS * 4);

    const held = await call(shadowBox.getShadowBoxStatus({}));
    expect(held.box?.state).toBe(ShadowBoxState.BOXING);
    expect(held.brokers[1]?.box).toBeUndefined();
    expect(held.brokers[1]?.errorMessage).toBeTruthy();

    setShadowBoxSimulatorOptions({ downBrokers: [] });
    await rs.advanceTimersByTimeAsync(1000);
    const finished = await call(shadowBox.getShadowBoxStatus({}));
    expect(finished.box?.state).toBe(ShadowBoxState.BOXED);
  });

  test('a down broker holds Unbox too', async () => {
    const shadowBox = client();
    await call(shadowBox.box({}));
    await rs.advanceTimersByTimeAsync(SETTLE_MS);
    setShadowBoxSimulatorOptions({ downBrokers: [3] });

    await call(shadowBox.unbox({}));
    await rs.advanceTimersByTimeAsync(SETTLE_MS * 4);
    const status = await call(shadowBox.getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.UNBOXING);
  });

  test('new settings while boxed go back through boxing, and brokers keep blocking on their old copy', async () => {
    const shadowBox = client();
    const boxing = await call(shadowBox.box({}));
    await rs.advanceTimersByTimeAsync(SETTLE_MS);

    const reboxing = await call(
      shadowBox.updateShadowBoxSettings({
        settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
        updateMask: { paths: ['read_policy.exempt_principals'] },
      })
    );
    expect(reboxing.box?.state).toBe(ShadowBoxState.BOXING);

    const status = await call(shadowBox.getShadowBoxStatus({}));
    const behind = status.brokers.filter((broker) => broker.box?.revision !== reboxing.box?.revision);
    expect(behind.length).toBeGreaterThan(0);
    expect(
      behind.every(
        (broker) => broker.box?.state === ShadowBoxState.BOXED && broker.box.revision === boxing.box?.revision
      )
    ).toBe(true);

    await rs.advanceTimersByTimeAsync(SETTLE_MS);
    const boxed = await call(shadowBox.getShadowBoxStatus({}));
    expect(boxed.box?.state).toBe(ShadowBoxState.BOXED);
    expect(boxed.box?.settings?.readPolicy?.exemptPrincipals).toEqual(['shadow-orders']);
  });

  test('the exempt_principals mask only adds names; the read_policy mask replaces them', async () => {
    const shadowBox = client();
    await call(
      shadowBox.updateShadowBoxSettings({
        settings: { readPolicy: { exemptPrincipals: ['link-user'] } },
        updateMask: { paths: ['read_policy'] },
      })
    );
    const added = await call(
      shadowBox.updateShadowBoxSettings({
        settings: { readPolicy: { exemptPrincipals: ['new-user'], allowAllReads: true } },
        updateMask: { paths: ['read_policy.exempt_principals'] },
      })
    );
    expect(added.box?.settings?.readPolicy).toMatchObject({
      exemptPrincipals: ['link-user', 'new-user'],
      allowAllReads: false,
    });

    const replaced = await call(
      shadowBox.updateShadowBoxSettings({
        settings: { readPolicy: { exemptPrincipals: ['new-user'] } },
        updateMask: { paths: ['read_policy'] },
      })
    );
    expect(replaced.box?.settings?.readPolicy?.exemptPrincipals).toEqual(['new-user']);
  });

  test('an Unbox keeps the settings saved', async () => {
    const shadowBox = client();
    await call(
      shadowBox.updateShadowBoxSettings({
        settings: { readPolicy: { allowAllReads: true } },
        updateMask: { paths: ['read_policy'] },
      })
    );
    await call(shadowBox.box({}));
    await rs.advanceTimersByTimeAsync(SETTLE_MS);
    await call(shadowBox.unbox({}));
    await rs.advanceTimersByTimeAsync(SETTLE_MS);

    const status = await call(shadowBox.getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.UNBOXED);
    expect(status.box?.settings?.readPolicy?.allowAllReads).toBe(true);
  });

  test('each Box precondition fails with FAILED_PRECONDITION', async () => {
    for (const boxFailure of [
      'feature-inactive',
      'own-shadow-link',
      'data-migration',
      'cluster-recovery',
      'read-replica',
    ] as const) {
      setShadowBoxSimulatorOptions({ boxFailure });
      const error = await failure(client().box({}));
      expect(error.code).toBe(Code.FailedPrecondition);
    }
  });

  test('with no controller leader, the status and changes are UNAVAILABLE but each broker still answers for itself', async () => {
    setShadowBoxSimulatorOptions({ noLeader: true });
    const shadowBox = client();
    expect((await failure(shadowBox.getShadowBoxStatus({}))).code).toBe(Code.Unavailable);
    expect((await failure(shadowBox.box({}))).code).toBe(Code.Unavailable);

    const broker = await call(shadowBox.getShadowBoxBrokerStatus({ nodeId: 2 }));
    expect(broker.broker?.nodeId).toBe(2);
    expect(broker.broker?.box?.state).toBe(ShadowBoxState.UNBOXED);
  });

  test('the GetShadowBoxBrokerStatus call: a down broker is UNAVAILABLE, a broker that isn’t a member is NOT_FOUND', async () => {
    setShadowBoxSimulatorOptions({ downBrokers: [3] });
    const shadowBox = client();
    expect((await failure(shadowBox.getShadowBoxBrokerStatus({ nodeId: 3 }))).code).toBe(Code.Unavailable);
    expect((await failure(shadowBox.getShadowBoxBrokerStatus({ nodeId: 9 }))).code).toBe(Code.NotFound);
  });

  test('a slow call returns DEADLINE_EXCEEDED, yet the change still applies', async () => {
    setShadowBoxSimulatorOptions({ slowCalls: true });
    const shadowBox = client();
    expect((await failure(shadowBox.box({}))).code).toBe(Code.DeadlineExceeded);

    setShadowBoxSimulatorOptions({ slowCalls: false });
    const status = await call(shadowBox.getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.BOXING);
  });

  test('a record from the old simulator is ignored', async () => {
    window.localStorage.setItem(
      SHADOW_BOX_SIMULATOR_STORAGE_KEY,
      JSON.stringify({ version: 1, enabled: true, options: {}, clusters: { 'cluster-1': { target: 'boxed' } } })
    );
    const status = await call(client().getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.UNBOXED);
  });
});
