import { useDirection } from '@base-ui/react/direction-provider';
import { type RefObject, useLayoutEffect, useState } from 'react';

export function useInheritedDirection(root: RefObject<HTMLElement | null>) {
  const inherited = useDirection();
  const [direction, setDirection] = useState(inherited);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) {
      return;
    }
    const update = () => {
      const resolved = element.closest('[dir]') ? getComputedStyle(element).direction : inherited;
      setDirection(resolved === 'rtl' ? 'rtl' : 'ltr');
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(element.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ['dir'],
      subtree: true,
    });
    return () => observer.disconnect();
  }, [root, inherited]);
  return direction;
}
