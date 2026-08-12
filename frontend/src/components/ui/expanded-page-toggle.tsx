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

/** Fullscreen toggle for useExpandedPageMode pages. Place it in the top-right corner of the surface it expands. */
export function ExpandedPageToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const label = expanded ? 'Exit fullscreen' : 'Enter fullscreen';

  return (
    <Button aria-label={label} onClick={onToggle} size="icon-sm" title={label} variant="secondary-ghost">
      {expanded ? <Minimize2 /> : <Maximize2 />}
    </Button>
  );
}
