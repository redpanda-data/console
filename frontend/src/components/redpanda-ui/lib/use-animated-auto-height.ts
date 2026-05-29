'use client';

import { animate } from 'motion/react';
import { useLayoutEffect, useState } from 'react';

// Callback ref is state-backed so the effect re-runs once the node attaches inside the portal.
export function useAnimatedAutoHeight<T extends HTMLElement>(enabled: boolean) {
  const [node, setNode] = useState<T | null>(null);

  useLayoutEffect(() => {
    if (!(enabled && node)) {
      return;
    }

    let lastObserved = node.offsetHeight;
    let expectedHeight: number | null = null;
    let activeAnimation: ReturnType<typeof animate> | null = null;

    const observer = new ResizeObserver(() => {
      const measured = node.offsetHeight;

      // Ignore echoes from heights we set ourselves during the animation.
      if (expectedHeight !== null && Math.abs(measured - expectedHeight) < 1) {
        return;
      }
      if (Math.abs(measured - lastObserved) < 1) {
        return;
      }

      const from = lastObserved;
      const to = measured;
      lastObserved = to;

      activeAnimation?.stop();
      // Pin to the old height before the next paint so the animation has a start frame.
      node.style.height = `${from}px`;
      expectedHeight = from;

      activeAnimation = animate(from, to, {
        duration: 0.25,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (value) => {
          expectedHeight = value;
          node.style.height = `${value}px`;
        },
        onComplete: () => {
          node.style.height = '';
          expectedHeight = null;
          activeAnimation = null;
        },
      });
    });

    observer.observe(node);

    return () => {
      activeAnimation?.stop();
      observer.disconnect();
      node.style.height = '';
    };
  }, [enabled, node]);

  return setNode;
}
