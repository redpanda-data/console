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

import { Alert } from 'components/redpanda-ui/components/alert';
import { cn } from 'components/redpanda-ui/lib/utils';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Warning banner for a pipeline config that can't be shown as-is — shared by the visual canvas (stale
 * layout) and the sidebar outline (stale / can't build one yet). Renders the registry Alert in its
 * warning tone. Overrides the Alert's `w-full` back to `w-auto` so it stays content-width when floated
 * over the canvas (centered between the undo/redo + problems toolbars) and fills to its margins when
 * placed inline; callers pass positioning, padding and text size via `className`.
 */
export function InvalidConfigNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Alert className={cn('w-auto', className)} icon={<TriangleAlert />} variant="warning">
      <span className="col-start-2">{children}</span>
    </Alert>
  );
}
