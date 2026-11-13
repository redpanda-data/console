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

import { beforeEach, expect, rs, test } from '@rstest/core';
import { render } from '@testing-library/react';
import { useShadowLinkTopology } from 'react-query/api/shadow-link-topology';
import { useClusterFenceStore } from 'stores/cluster-fence-store';

import type { ShadowLinkTopology } from './shadow-link-topology';
import { ShadowLinkTopologySync } from './shadow-link-topology-sync';

rs.mock('react-query/api/shadow-link-topology', () => ({ useShadowLinkTopology: rs.fn() }));

const topology = (revision: bigint): ShadowLinkTopology => ({
  clusterName: 'dr-us-west-2',
  readers: [],
  sources: {
    'orders-dr': {
      kind: 'cloud',
      clusterId: 'prod',
      clusterName: 'prod-us-east-1',
      fence: {
        status: 'known',
        state: 'fenced',
        revision,
        stateChangedAt: new Date('2026-11-10T09:00:00Z'),
        exemptPrincipals: ['shadow-orders'],
        allowAllReads: false,
        brokers: [{ nodeId: 0, status: 'confirmed' }],
      },
    },
  },
  resolving: false,
  readersIncomplete: false,
});

const renderSync = (value: ShadowLinkTopology) => {
  rs.mocked(useShadowLinkTopology).mockReturnValue(value);
  const rendered = render(<ShadowLinkTopologySync />);
  return {
    ...rendered,
    rebuild: (next: ShadowLinkTopology) => {
      rs.mocked(useShadowLinkTopology).mockReturnValue(next);
      rendered.rerender(<ShadowLinkTopologySync />);
    },
  };
};

beforeEach(() => useClusterFenceStore.setState({ topology: null }));

test('keeps the published topology while a rebuild changes nothing, and swaps it once one does', () => {
  const first = topology(18n);
  const { rebuild } = renderSync(first);
  expect(useClusterFenceStore.getState().topology).toBe(first);

  rebuild(topology(18n));
  expect(useClusterFenceStore.getState().topology).toBe(first);

  const moved = topology(19n);
  rebuild(moved);
  expect(useClusterFenceStore.getState().topology).toBe(moved);
});

test('clears the topology when the app unmounts, so another cluster never sees this one’s', () => {
  const { unmount } = renderSync(topology(18n));
  unmount();
  expect(useClusterFenceStore.getState().topology).toBeNull();
});
