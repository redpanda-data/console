'use client';

import { useEffect, useState } from 'react';

type ScrollEdges = { top: boolean; bottom: boolean };

/**
 * Tracks whether a scroll container can be scrolled up or down.
 *
 * Uses 1px sentinel elements at the top and bottom of the scrollable content
 * with `IntersectionObserver` rooted on the container. A sentinel that is
 * intersecting means that edge is currently in view (nothing further to
 * scroll in that direction); not intersecting means there is more content
 * past that edge.
 */
export function useScrollShadow<T extends HTMLElement>(enabled: boolean) {
  const [container, setContainer] = useState<T | null>(null);
  const [topSentinel, setTopSentinel] = useState<HTMLElement | null>(null);
  const [bottomSentinel, setBottomSentinel] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ top: false, bottom: false });

  useEffect(() => {
    if (!(enabled && container && topSentinel && bottomSentinel)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setEdges((prev) => {
          let next = prev;
          for (const entry of entries) {
            const hasMore = !entry.isIntersecting;
            if (entry.target === topSentinel && next.top !== hasMore) {
              next = { ...next, top: hasMore };
            } else if (entry.target === bottomSentinel && next.bottom !== hasMore) {
              next = { ...next, bottom: hasMore };
            }
          }
          return next;
        });
      },
      { root: container, threshold: 0 }
    );

    observer.observe(topSentinel);
    observer.observe(bottomSentinel);

    return () => observer.disconnect();
  }, [enabled, container, topSentinel, bottomSentinel]);

  return {
    containerRef: setContainer,
    topRef: setTopSentinel,
    bottomRef: setBottomSentinel,
    edges,
  };
}
