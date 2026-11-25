'use client';

import { type RefObject, useEffect, useState } from 'react';

type Orientation = 'vertical' | 'horizontal';
interface ScrollEdges {
  end: boolean;
  start: boolean;
}

function observeScrollContent(element: HTMLElement, update: () => void): () => void {
  const resize = new ResizeObserver(update);
  const observedChildren = new Set<Element>();
  resize.observe(element);

  function syncChildren() {
    const children = new Set(element.children);
    for (const child of observedChildren) {
      if (!children.has(child)) {
        resize.unobserve(child);
        observedChildren.delete(child);
      }
    }
    for (const child of children) {
      if (!observedChildren.has(child)) {
        resize.observe(child);
        observedChildren.add(child);
      }
    }
    update();
  }

  const mutation = new MutationObserver(syncChildren);
  mutation.observe(element, { childList: true });
  syncChildren();
  element.addEventListener('scroll', update, { passive: true });
  return () => {
    element.removeEventListener('scroll', update);
    resize.disconnect();
    mutation.disconnect();
  };
}

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

  useEffect(
    function observeScrollEdges() {
      const el = ref.current;
      if (el === null || !enabled) {
        return;
      }
      const update = () => {
        const isVertical = orientation === 'vertical';
        // Horizontal assumes LTR (scrollLeft grows from 0 at the start edge); RTL is not handled.
        const scroll = isVertical ? el.scrollTop : el.scrollLeft;
        const max = isVertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
        const start = scroll > 1;
        const end = scroll < max - 1;
        // Re-render only when an edge actually flips, not on every scroll frame.
        setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
      };
      return observeScrollContent(el, update);
    },
    [ref, enabled, orientation]
  );

  return edges;
}
