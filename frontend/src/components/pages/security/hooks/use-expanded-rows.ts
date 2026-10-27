import { useState } from 'react';

/** Expanded state of a set of collapsible rows, keyed by row id. */
export function useExpandedRows() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return { isExpanded: (key: string) => expanded.has(key), toggle };
}
