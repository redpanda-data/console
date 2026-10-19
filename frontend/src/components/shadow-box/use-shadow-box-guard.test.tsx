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

import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { renderHook } from '@testing-library/react';

rs.mock('react-query/api/shadow-box', () => ({ useShadowBoxStatusQuery: rs.fn() }));

import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';

import type { BoxPhase } from './shadow-box-model';
import { useShadowBoxGuard } from './use-shadow-box-guard';

const POLICY_VIOLATION = 'POLICY_VIOLATION: fetch rejected by the configured cluster policy';

const mockStatus = (phase: BoxPhase, { known = true, allowAllReads = false } = {}) =>
  rs.mocked(useShadowBoxStatusQuery).mockReturnValue({
    known,
    summary: { phase, allowAllReads },
  } as unknown as ReturnType<typeof useShadowBoxStatusQuery>);

describe('useShadowBoxGuard', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test.each([
    ['boxing', true],
    ['boxed', true],
    ['unboxing', false],
    ['unboxed', false],
  ] as const)('while %s, disables writes: %s', (phase, disabled) => {
    mockStatus(phase);
    const { result } = renderHook(() => useShadowBoxGuard());

    expect(result.current.reasonFor('createTopic') !== undefined).toBe(disabled);
  });

  test('names the action it blocks and how to undo it', () => {
    mockStatus('boxed');
    const { result } = renderHook(() => useShadowBoxGuard());

    expect(result.current.reasonFor('editAcls')).toBe(
      'You can’t change ACLs while this cluster is shadow boxed. Unbox the cluster first.'
    );
  });

  test('disables nothing until the status has loaded', () => {
    mockStatus('boxed', { known: false });
    const { result } = renderHook(() => useShadowBoxGuard());

    expect(result.current.reasonFor('produce')).toBeUndefined();
  });

  test('blames the box for a rejected fetch only while it blocks reads', () => {
    mockStatus('boxed');
    expect(renderHook(() => useShadowBoxGuard()).result.current.isBoxedRead(POLICY_VIOLATION)).toBe(true);

    mockStatus('boxed', { allowAllReads: true });
    const { result } = renderHook(() => useShadowBoxGuard());
    expect(result.current.readsBlocked).toBe(false);
    expect(result.current.isBoxedRead(POLICY_VIOLATION)).toBe(false);
    expect(result.current.reasonFor('produce')).toBeDefined();
  });
});
