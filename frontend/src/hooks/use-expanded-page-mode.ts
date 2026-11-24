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

import { useCallback, useLayoutEffect, useState } from 'react';

const PAGE_EXPANDED_ATTR = 'data-page-expanded';

const clearPageExpanded = () => document.documentElement.removeAttribute(PAGE_EXPANDED_ATTR);

const readStoredExpanded = (storageKey: string) => {
  try {
    return localStorage.getItem(storageKey) === 'full';
  } catch {
    return false;
  }
};

/**
 * Full-width ("expanded") mode for a work-surface page, in normal document flow.
 * Persisted per browser under `storageKey`.
 *
 * Attach `ref` to the page root: the attribute is held only while that root is on
 * screen, because embedded Cloud UI keeps Console mounted but hidden on host routes.
 * Applies the attribute in the same frame as the page resize; cleanup also handles the element detaching.
 *
 * The `data-page-expanded` attribute releases width constraints in both shells.
 * If storage is blocked, expansion still works but doesn't survive a reload.
 */
export function useExpandedPageMode({ storageKey }: { storageKey: string }) {
  const [expanded, setExpanded] = useState(() => readStoredExpanded(storageKey));
  const [pageRoot, setPageRoot] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!pageRoot) {
      return clearPageExpanded;
    }

    const sync = () => {
      const onScreen = pageRoot.getClientRects().length > 0;
      document.documentElement.toggleAttribute(PAGE_EXPANDED_ATTR, expanded && onScreen);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(pageRoot);
    return () => {
      observer.disconnect();
      clearPageExpanded();
    };
  }, [pageRoot, expanded]);

  const toggleExpanded = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      try {
        localStorage.setItem(storageKey, next ? 'full' : 'boxed');
      } catch {}
      return next;
    });
  }, [storageKey]);

  const pageMode: {
    expanded: boolean;
    toggleExpanded: () => void;
    ref: (el: HTMLElement | null) => void;
  } = { expanded, toggleExpanded, ref: setPageRoot };
  return pageMode;
}
