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

import { cva, type VariantProps } from 'class-variance-authority';
import { Alert } from 'components/redpanda-ui/components/alert';
import { cn } from 'components/redpanda-ui/lib/utils';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

// `w-auto` overrides the Alert's `w-full`, so the notice stays content-width when floated over the canvas.
const invalidConfigNoticeVariants = cva('w-auto', {
  variants: {
    variant: {
      default: '',
      // Floated over the canvas: tighter padding, and a shadow and blur to lift it off the graph.
      floating: 'px-3 py-1.5 text-body shadow-sm backdrop-blur-sm',
      // Inline in the sidebar outline.
      compact: 'px-2.5 py-2 text-body-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

/**
 * Warning banner for a pipeline config that can't be shown as-is, shared by the visual canvas and the
 * sidebar outline. `variant` owns the notice's padding, type size and elevation; callers pass only
 * positioning via `className`.
 */
export function InvalidConfigNotice({
  children,
  className,
  variant,
}: { children: ReactNode; className?: string } & VariantProps<typeof invalidConfigNoticeVariants>) {
  return (
    <Alert
      className={cn(invalidConfigNoticeVariants({ variant }), className)}
      icon={<TriangleAlert />}
      variant="warning"
    >
      <span className="col-start-2">{children}</span>
    </Alert>
  );
}
