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

import { cn } from 'components/redpanda-ui/lib/utils';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Warning banner for a pipeline config that can't be shown as-is — shared by the visual canvas (stale
 * layout) and the sidebar outline (stale / can't build one yet). A `role=status` region so it's
 * announced; callers pass positioning, padding and text size via `className`.
 */
export function InvalidConfigNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <output
      className={cn(
        'flex items-start gap-2 rounded-md border border-warning/40 bg-warning-subtle text-foreground',
        className
      )}
    >
      <TriangleAlert className="mt-px size-4 shrink-0 text-warning" />
      <span>{children}</span>
    </output>
  );
}
