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

import { beforeEach, expect, test } from '@rstest/core';
import { renderHook } from '@testing-library/react';
import { ClusterFenceState } from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { connectQueryWrapper } from 'test-utils';

import { enableFenceFixtures, fenceStatus, readFenceStatus, serveFenceStatus } from './cluster-fence.test-utils';
import { useClusterFenceGuard } from './use-cluster-fence-guard';

const POLICY_VIOLATION = 'POLICY_VIOLATION: fetch rejected by the configured cluster policy';

beforeEach(enableFenceFixtures);

async function renderGuard(state: ClusterFenceState, allowAllReads = false) {
  const response = fenceStatus(state);
  if (response.fence?.settings?.readPolicy) {
    response.fence.settings.readPolicy.allowAllReads = allowAllReads;
  }
  const { transport } = serveFenceStatus(response);
  const { wrapper, queryClient } = connectQueryWrapper({}, transport);
  await readFenceStatus(queryClient, transport);
  return renderHook(() => useClusterFenceGuard(), { wrapper });
}

test.each([
  [ClusterFenceState.FENCING, true],
  [ClusterFenceState.FENCED, true],
  [ClusterFenceState.UNFENCING, false],
  [ClusterFenceState.UNFENCED, false],
] as const)('enables or disables writes from the server fence phase: %s', async (phase, disabled) => {
  const { result } = await renderGuard(phase);
  expect(result.current.reasonFor('createTopic') !== undefined).toBe(disabled);
});

test('names the blocked action and how to unblock it', async () => {
  const { result } = await renderGuard(ClusterFenceState.FENCED);

  expect(result.current.reasonFor('editAcls')).toBe(
    'You can’t create or delete ACLs while this cluster is fenced. Unfence it first.'
  );
  expect(result.current.reasonFor('createShadowLink')).toBe(
    'A fenced cluster rejects new shadow links, and retrying won’t help. Unfence it first.'
  );
});

test('still allows internal-topic operations except produce to _schemas', async () => {
  const { result } = await renderGuard(ClusterFenceState.FENCED);

  expect(result.current.reasonFor('editTopicConfig', '_orders')).toBeDefined();
  expect(result.current.reasonFor('deleteTopic', 'orders')).toBeDefined();
  expect(result.current.reasonFor('editTopicConfig', '_schemas')).toBeUndefined();
  expect(result.current.reasonFor('deleteTopic', '__consumer_offsets')).toBeUndefined();
  expect(result.current.reasonFor('produce', '_redpanda.audit_log')).toBeUndefined();
  expect(result.current.reasonFor('produce', '_schemas')).toBeDefined();
});

test('blames a rejected fetch on the fence only while it blocks reads', async () => {
  const blocked = await renderGuard(ClusterFenceState.FENCED);
  expect(blocked.result.current.isFencedRead(POLICY_VIOLATION)).toBe(true);
  blocked.unmount();

  const { result } = await renderGuard(ClusterFenceState.FENCED, true);
  expect(result.current.isFencedRead(POLICY_VIOLATION)).toBe(false);
  expect(result.current.reasonFor('produce')).toBeDefined();
});
