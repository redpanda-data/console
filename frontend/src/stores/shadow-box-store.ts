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

import type { BoxPhase } from '../components/shadow-box/shadow-box-model';
import type { ShadowLinkTopology } from '../federation/types';

type ShadowBoxStore = {
  /** The box phase the status query last saw, for code outside React such as toast formatting. */
  phase: BoxPhase | null;
  /** Set by the Cloud host; `null` when standalone or when the host shares nothing. */
  topology: ShadowLinkTopology | null;
  openCluster: ((clusterId: string, path: string) => void) | null;
  setPhase: (phase: BoxPhase | null) => void;
  setHostContext: (
    topology: ShadowLinkTopology | null,
    openCluster: ((clusterId: string, path: string) => void) | null
  ) => void;
};

export const useShadowBoxStore = create<ShadowBoxStore>((set) => ({
  phase: null,
  topology: null,
  openCluster: null,
  setPhase: (phase) => set({ phase }),
  setHostContext: (topology, openCluster) => set({ topology, openCluster }),
}));
