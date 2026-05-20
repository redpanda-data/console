'use client';

import { useEffect, useState } from 'react';

const SCROLL_EDGE_THRESHOLD = 2;

type ScrollEdges = { top: boolean; bottom: boolean };

export function useScrollShadow<T extends HTMLElement>(enabled: boolean) {
  const [node, setNode] = useState<T | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ top: false, bottom: false });

  useEffect(() => {
    if (!(enabled && node)) {
      return;
    }

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = node;
      setEdges({
        top: scrollTop > SCROLL_EDGE_THRESHOLD,
        bottom: scrollTop + clientHeight < scrollHeight - SCROLL_EDGE_THRESHOLD,
      });
    };

    update();
    node.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(node);
    for (const child of Array.from(node.children)) {
      if (child instanceof HTMLElement) {
        ro.observe(child);
      }
    }

    return () => {
      node.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [enabled, node]);

  return { ref: setNode, edges };
}