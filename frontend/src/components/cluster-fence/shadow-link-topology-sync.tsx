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

import { useEffect } from 'react';
import { useShadowLinkTopology } from 'react-query/api/shadow-link-topology';
import { useClusterFenceStore } from 'stores/cluster-fence-store';

import type { ShadowLinkTopology } from './shadow-link-topology';

const contentsOf = (topology: ShadowLinkTopology | null) =>
  JSON.stringify(topology, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));

/**
 * Resolves the shadow link topology once for the whole embedded app, so every page that reads it
 * shares one set of requests and one poll of each source's fence. The store only changes when the
 * contents do: every refetch rebuilds the topology, and the Fence dialog, for one, reseeds its
 * exempt users whenever the readers change. Renders nothing.
 */
export const ShadowLinkTopologySync = () => {
  const topology = useShadowLinkTopology();
  useEffect(() => {
    const store = useClusterFenceStore.getState();
    if (contentsOf(store.topology) !== contentsOf(topology)) {
      store.setTopology(topology);
    }
  }, [topology]);
  useEffect(() => () => useClusterFenceStore.getState().setTopology(null), []);
  return null;
};
