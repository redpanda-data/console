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

import { useState } from 'react';

import type { BoxSummary } from './shadow-box-model';

/**
 * Pins the box a dialog opened against. Writes send its revision, so a change someone else makes
 * while the dialog is open fails instead of being overwritten, and `changed` says so up front.
 * `settling` covers this dialog's own write, whose new revision isn't someone else's change, and
 * `own` is a box an earlier write of this dialog left behind, which replaces the pinned one.
 */
export const useOpenedBox = (live: BoxSummary, settling: boolean, own?: BoxSummary) => {
  const [pinned, setPinned] = useState(live);
  const opened = own ?? pinned;
  return {
    opened,
    changed: !settling && live.revision !== opened.revision,
    /** Adopts the box as it is now; callers reseed their form from the same value. */
    refresh: () => setPinned(live),
  };
};
