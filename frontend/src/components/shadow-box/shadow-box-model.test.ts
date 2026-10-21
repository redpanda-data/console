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

import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { describe, expect, test } from '@rstest/core';
import {
  GetShadowBoxStatusResponseSchema,
  ShadowBoxSchema,
  ShadowBoxState,
} from 'protogen/redpanda/core/admin/v2/shadow_box_pb';

import {
  canBoxFromPhase,
  formatBoxDuration,
  getBrokerProgress,
  getReadPolicyWarnings,
  isFencedPhase,
  isLongBox,
  LONG_BOX_THRESHOLD_MS,
  summarizeBox,
  toBoxPhase,
} from './shadow-box-model';

const NOW = Date.parse('2026-10-19T12:00:00Z');

describe('toBoxPhase', () => {
  test('maps every state, treating an unset one as unboxed', () => {
    expect(toBoxPhase(ShadowBoxState.UNSPECIFIED)).toBe('unboxed');
    expect(toBoxPhase(undefined)).toBe('unboxed');
    expect(toBoxPhase(ShadowBoxState.UNBOXED)).toBe('unboxed');
    expect(toBoxPhase(ShadowBoxState.BOXING)).toBe('boxing');
    expect(toBoxPhase(ShadowBoxState.BOXED)).toBe('boxed');
    expect(toBoxPhase(ShadowBoxState.UNBOXING)).toBe('unboxing');
  });
});

describe('phase rules', () => {
  test('writes can fail in every phase but unboxed', () => {
    expect(isFencedPhase('unboxed')).toBe(false);
    expect(isFencedPhase('boxing')).toBe(true);
    expect(isFencedPhase('boxed')).toBe(true);
    expect(isFencedPhase('unboxing')).toBe(true);
  });

  test('Box is accepted while unboxed or unboxing', () => {
    expect(canBoxFromPhase('unboxed')).toBe(true);
    expect(canBoxFromPhase('unboxing')).toBe(true);
    expect(canBoxFromPhase('boxing')).toBe(false);
    expect(canBoxFromPhase('boxed')).toBe(false);
  });
});

describe('getBrokerProgress', () => {
  test('a broker has applied the box once its copy carries the leader’s revision', () => {
    const response = create(GetShadowBoxStatusResponseSchema, {
      box: { state: ShadowBoxState.BOXING, revision: BigInt(4) },
      brokers: [
        { nodeId: 0, box: { revision: BigInt(4) } },
        { nodeId: 1, box: { revision: BigInt(3) } },
        { nodeId: 2, errorMessage: 'Broker 2 did not answer' },
      ],
    });

    expect(getBrokerProgress(response)).toEqual([
      { nodeId: 0, status: 'applied' },
      { nodeId: 1, status: 'pending' },
      { nodeId: 2, status: 'unreachable', errorMessage: 'Broker 2 did not answer' },
    ]);
  });

  test('is empty before a status loads', () => {
    expect(getBrokerProgress(undefined)).toEqual([]);
  });
});

describe('summarizeBox', () => {
  test('reads the phase, revision, time in state and saved settings', () => {
    const changedAt = new Date(NOW - 5 * 60 * 1000);
    const summary = summarizeBox(
      create(ShadowBoxSchema, {
        state: ShadowBoxState.BOXED,
        revision: BigInt(3),
        stateChangedAt: timestampFromDate(changedAt),
        settings: {
          readPolicy: { exemptPrincipals: ['shadow-orders'], allowAllReads: false },
          skipTransactionExpiration: true,
        },
      })
    );

    expect(summary).toEqual({
      phase: 'boxed',
      revision: BigInt(3),
      stateChangedAt: changedAt,
      exemptPrincipals: ['shadow-orders'],
      allowAllReads: false,
      skipTransactionExpiration: true,
    });
  });

  test('defaults to an unboxed cluster that was never boxed', () => {
    expect(summarizeBox(undefined)).toMatchObject({ phase: 'unboxed', revision: BigInt(-1), exemptPrincipals: [] });
  });
});

describe('formatBoxDuration', () => {
  test.each([
    [20 * 1000, 'less than a minute'],
    [12 * 60 * 1000, '12 min'],
    [3 * 60 * 60 * 1000, '3 h'],
    [(2 * 60 + 14) * 60 * 1000, '2 h 14 min'],
    [24 * 60 * 60 * 1000, '1 day'],
    [9 * 24 * 60 * 60 * 1000, '9 days'],
  ])('%i ms reads as %s', (elapsed, label) => {
    expect(formatBoxDuration(elapsed)).toBe(label);
  });
});

describe('isLongBox', () => {
  test('only a settled box held past the threshold counts', () => {
    const boxedFor = (ms: number) => ({ phase: 'boxed' as const, stateChangedAt: new Date(NOW - ms) });
    expect(isLongBox(boxedFor(LONG_BOX_THRESHOLD_MS - 1), NOW)).toBe(false);
    expect(isLongBox(boxedFor(LONG_BOX_THRESHOLD_MS), NOW)).toBe(true);
    expect(isLongBox({ phase: 'boxing', stateChangedAt: new Date(NOW - 2 * LONG_BOX_THRESHOLD_MS) }, NOW)).toBe(false);
  });
});

describe('getReadPolicyWarnings', () => {
  test('warns about the cases the broker logs on Box', () => {
    expect(getReadPolicyWarnings([], false).map((warning) => warning.id)).toEqual(['empty']);
    expect(getReadPolicyWarnings([''], false).map((warning) => warning.id)).toEqual(['blank']);
    expect(getReadPolicyWarnings(['User:shadow-orders'], false)).toEqual([
      {
        id: 'prefix-User:shadow-orders',
        message: '“User:shadow-orders” matches no connection. Enter the bare user name, “shadow-orders”.',
      },
    ]);
  });

  test('says nothing when every reader is allowed or the list is fine', () => {
    expect(getReadPolicyWarnings([], true)).toEqual([]);
    expect(getReadPolicyWarnings(['shadow-orders'], false)).toEqual([]);
  });
});
