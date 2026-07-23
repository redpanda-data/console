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

import { Button } from 'components/redpanda-ui/components/button';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * Fullscreen toggle for pages with an expanded page mode (see useExpandedPageMode).
 *
 * Placement convention: the top-right corner of the work surface it expands (the SQL
 * studio's title bar, the RPCN panel's tab strip) — never among the page actions,
 * where it would crowd primary buttons like Save.
 */
export function ExpandedPageToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <Button
      aria-label={expanded ? 'Exit fullscreen' : 'Enter fullscreen'}
      onClick={onToggle}
      size="icon-sm"
      title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
      variant="secondary-ghost"
    >
      {expanded ? <Minimize2 /> : <Maximize2 />}
    </Button>
  );
}
