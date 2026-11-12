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

import { create } from 'zustand';

import type { FencePhase } from '../components/cluster-fence/cluster-fence-model';
import type { ShadowLinkTopology } from '../components/cluster-fence/shadow-link-topology';

type ClusterFenceStore = {
  /** The fence phase the status query last saw, for code outside React such as toast formatting. */
  phase: FencePhase | null;
  /**
   * The shadow links around this cluster, which Console reads from Redpanda Cloud when embedded there;
   * `null` when standalone, or when Cloud's link list can't load.
   */
  topology: ShadowLinkTopology | null;
  /** Set by the Cloud host, which can open another cluster's pages; `null` when standalone. */
  openCluster: ((clusterId: string, path: string) => void) | null;
  setPhase: (phase: FencePhase | null) => void;
  setTopology: (topology: ShadowLinkTopology | null) => void;
  setOpenCluster: (openCluster: ((clusterId: string, path: string) => void) | null) => void;
};

export const useClusterFenceStore = create<ClusterFenceStore>((set) => ({
  phase: null,
  topology: null,
  openCluster: null,
  setPhase: (phase) => set({ phase }),
  setTopology: (topology) => set({ topology }),
  setOpenCluster: (openCluster) => set({ openCluster }),
}));
