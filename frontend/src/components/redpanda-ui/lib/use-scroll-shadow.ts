'use client';

import { type RefObject, useCallback, useEffect, useState } from 'react';

type Orientation = 'vertical' | 'horizontal';
type ScrollEdges = { start: boolean; end: boolean };

/**
 * Tracks whether a scroll container has hidden content past its start/end
 * edges, so a consumer can fade in shadows on the overflowing sides only.
 *
 * `start`/`end` follow the axis: for `vertical` they mean top/bottom; for
 * `horizontal`, left/right. Reads scroll geometry on scroll and whenever the
 * container or its content resizes, re-rendering only when an edge flips.
 */
export function useScrollShadow<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled = true,
  orientation: Orientation = 'vertical'
): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const isVertical = orientation === 'vertical';
    // Horizontal assumes LTR (scrollLeft grows from 0 at the start edge); RTL is not handled.
    const scroll = isVertical ? el.scrollTop : el.scrollLeft;
    const max = isVertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
    const start = scroll > 1;
    const end = scroll < max - 1;
    // Re-render only when an edge actually flips, not on every scroll frame.
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [ref, orientation]);

  useEffect(() => {
    const el = ref.current;
    if (!(el && enabled)) {
      return;
    }
    update();
    el.addEventListener('scroll', update, { passive: true });
    // Observe the container and its content so edges re-evaluate as either grows. Re-observing an
    // existing child is a no-op, so syncing on every mutation just picks up newly added children.
    const resize = new ResizeObserver(update);
    resize.observe(el);
    const observeChildren = () => {
      for (const child of Array.from(el.children)) {
        resize.observe(child);
      }
    };
    observeChildren();
    // Children swapped/added after mount aren't covered by the snapshot above; re-sync on mutation.
    const mutation = new MutationObserver(() => {
      observeChildren();
      update();
    });
    mutation.observe(el, { childList: true });
    return () => {
      el.removeEventListener('scroll', update);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [ref, enabled, update]);

  return edges;
}
