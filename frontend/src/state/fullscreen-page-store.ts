/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from 'zustand';

/**
 * Runtime fullscreen signal for pages whose fullscreen-ness can't be expressed as
 * static route metadata (`staticData.fullscreen`) because it depends on runtime
 * conditions — e.g. the RPCN pipeline editor, which is only fullscreen for the
 * embedded, diagrams-enabled view/edit tiers, not the legacy form rendered on the
 * same routes. The page sets `active` while mounted; the layout (`__root`, header)
 * strips console chrome when it's true, in addition to the static-metadata check.
 */
type FullscreenPageStore = {
  active: boolean;
  setActive: (active: boolean) => void;
};

export const useFullscreenPageStore = create<FullscreenPageStore>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
