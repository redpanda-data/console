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

import { useScrollShadow } from 'components/redpanda-ui/lib/use-scroll-shadow';
import { cn } from 'components/redpanda-ui/lib/utils';
import { type ReactNode, useRef } from 'react';

type ScrollShadowProps = {
  /** Classes for the scroll container (it fills its flex parent and scrolls). */
  className?: string;
  /** Classes for the inner content wrapper (padding lives here so shadows stay flush to the edges). */
  contentClassName?: string;
  children: ReactNode;
};

/**
 * Vertical scroll container with fading top/bottom shadows that appear only when content
 * overflows that edge — the same affordance as `DialogBody`.
 */
export function ScrollShadow({ className, contentClassName, children }: ScrollShadowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const edges = useScrollShadow(containerRef);

  return (
    <div className={cn('relative min-h-0 flex-1 overflow-y-auto', className)} ref={containerRef}>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none sticky top-0 z-10 h-0 transition-opacity duration-150',
          edges.start ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-black/10 to-transparent dark:from-black/40" />
      </div>
      <div className={contentClassName}>{children}</div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none sticky bottom-0 z-10 h-0 transition-opacity duration-150',
          edges.end ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black/10 to-transparent dark:from-black/40" />
      </div>
    </div>
  );
}
