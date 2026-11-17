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

rs.mock('react-query/api/cluster-fence', () => ({ useClusterFenceStatusQuery: rs.fn() }));

import { useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';

import { type FencePhase, isBlockingPhase } from './cluster-fence-model';
import { useClusterFenceGuard } from './use-cluster-fence-guard';

const POLICY_VIOLATION = 'POLICY_VIOLATION: fetch rejected by the configured cluster policy';

const mockStatus = (phase: FencePhase, { allowAllReads = false } = {}) =>
  rs.mocked(useClusterFenceStatusQuery).mockReturnValue({
    blocking: isBlockingPhase(phase),
    summary: { phase, allowAllReads },
  } as unknown as ReturnType<typeof useClusterFenceStatusQuery>);

describe('useClusterFenceGuard', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test.each([
    ['fencing', true],
    ['fenced', true],
    ['unfencing', false],
    ['unfenced', false],
  ] as const)('while %s, disables writes: %s', (phase, disabled) => {
    mockStatus(phase);
    const { result } = renderHook(() => useClusterFenceGuard());

    expect(result.current.reasonFor('createTopic') !== undefined).toBe(disabled);
  });

  test('names the action it blocks and how to undo it', () => {
    mockStatus('fenced');
    const { result } = renderHook(() => useClusterFenceGuard());

    expect(result.current.reasonFor('editAcls')).toBe(
      'You can’t create or delete ACLs while this cluster is fenced. Unfence it first.'
    );
    expect(result.current.reasonFor('createShadowLink')).toBe(
      'A fenced cluster rejects new shadow links, and retrying won’t help. Unfence it first.'
    );
  });

  test('only user topics are fenced: Redpanda’s internal topics stay open, and _schemas only takes no produce', () => {
    mockStatus('fenced');
    const { result } = renderHook(() => useClusterFenceGuard());

    expect(result.current.reasonFor('editTopicConfig', '_orders')).toBeDefined();
    expect(result.current.reasonFor('deleteTopic', 'orders')).toBeDefined();
    expect(result.current.reasonFor('editTopicConfig', '_schemas')).toBeUndefined();
    expect(result.current.reasonFor('deleteTopic', '__consumer_offsets')).toBeUndefined();
    expect(result.current.reasonFor('produce', '_redpanda.audit_log')).toBeUndefined();
    expect(result.current.reasonFor('produce', '_schemas')).toBeDefined();
  });

  test('blames the fence for a rejected fetch only while it blocks reads', () => {
    mockStatus('fenced');
    expect(renderHook(() => useClusterFenceGuard()).result.current.isFencedRead(POLICY_VIOLATION)).toBe(true);

    mockStatus('fenced', { allowAllReads: true });
    const { result } = renderHook(() => useClusterFenceGuard());
    expect(result.current.isFencedRead(POLICY_VIOLATION)).toBe(false);
    expect(result.current.reasonFor('produce')).toBeDefined();
  });
});
