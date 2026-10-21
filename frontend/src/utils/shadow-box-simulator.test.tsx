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

import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { ShadowBoxService } from 'protogen/redpanda/api/console/v1alpha1/shadowbox_pb';
import { ShadowBoxState } from 'protogen/redpanda/core/admin/v2/shadow_box_pb';

import {
  createShadowBoxSimulatorTransport,
  resetShadowBoxSimulator,
  SHADOW_BOX_SIMULATOR_STORAGE_KEY,
  setShadowBoxSimulatorOptions,
} from './shadow-box-simulator';

/** Every simulated broker has confirmed by then: three brokers at 1.4 s each plus up to 0.6 s of jitter. */
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

describe('shadow box simulator', () => {
  beforeEach(() => {
    rs.useFakeTimers();
    window.localStorage.removeItem(SHADOW_BOX_SIMULATOR_STORAGE_KEY);
    resetShadowBoxSimulator();
  });

  afterEach(() => {
    rs.useRealTimers();
  });

  test('a cluster starts unboxed with default settings', async () => {
    const status = await call(client().getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.UNBOXED);
    expect(status.box?.revision).toBe(BigInt(-1));
    expect(status.brokers).toHaveLength(3);
  });

  test('Box goes through Boxing to Boxed as brokers confirm, with the saved settings', async () => {
    const shadowBox = client();
    const saved = await call(
      shadowBox.updateShadowBoxSettings({
        settings: { readPolicy: { exemptPrincipals: ['shadow-orders'] } },
        updateMask: { paths: ['read_policy'] },
      })
    );
    expect(saved.box?.revision).toBe(BigInt(0));

    const boxed = await call(shadowBox.box({ expectedRevision: saved.box?.revision }));
    expect(boxed.box?.state).toBe(ShadowBoxState.BOXING);

    await rs.advanceTimersByTimeAsync(SETTLE_MS);
    const status = await call(shadowBox.getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.BOXED);
    expect(status.box?.settings?.readPolicy?.exemptPrincipals).toEqual(['shadow-orders']);
    expect(status.brokers.every((broker) => broker.box?.revision === status.box?.revision)).toBe(true);
  });

  test('a stale expected revision fails the way the broker does', async () => {
    const error = await call(client().box({ expectedRevision: BigInt(7) })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectError);
    expect((error as ConnectError).code).toBe(Code.FailedPrecondition);
    expect((error as ConnectError).rawMessage).toBe('Shadow boxing revision has changed');
  });

  test('a broker that never answers keeps the box in Boxing and reports an error', async () => {
    setShadowBoxSimulatorOptions({ unreachableBroker: true });
    const shadowBox = client();
    await call(shadowBox.box({}));
    await rs.advanceTimersByTimeAsync(SETTLE_MS * 2);

    const status = await call(shadowBox.getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.BOXING);
    expect(status.brokers[2]?.box).toBeUndefined();
    expect(status.brokers[2]?.errorMessage).toContain('did not answer');
  });

  test('an unfinished data migration rejects Box', async () => {
    setShadowBoxSimulatorOptions({ blockingMigration: true });
    const error = await call(client().box({})).catch((e: unknown) => e);
    expect((error as ConnectError).code).toBe(Code.FailedPrecondition);
  });

  test('Unbox releases the box, and a settings change while boxed starts Boxing again', async () => {
    const shadowBox = client();
    await call(shadowBox.box({}));
    await rs.advanceTimersByTimeAsync(SETTLE_MS);

    const reboxing = await call(
      shadowBox.updateShadowBoxSettings({
        settings: { readPolicy: { allowAllReads: true } },
        updateMask: { paths: ['read_policy'] },
      })
    );
    expect(reboxing.box?.state).toBe(ShadowBoxState.BOXING);
    await rs.advanceTimersByTimeAsync(SETTLE_MS);

    const unboxing = await call(shadowBox.unbox({ expectedRevision: reboxing.box?.revision }));
    expect(unboxing.box?.state).toBe(ShadowBoxState.UNBOXING);
    await rs.advanceTimersByTimeAsync(SETTLE_MS);

    const status = await call(shadowBox.getShadowBoxStatus({}));
    expect(status.box?.state).toBe(ShadowBoxState.UNBOXED);
    expect(status.box?.settings?.readPolicy?.allowAllReads).toBe(true);
  });
});
