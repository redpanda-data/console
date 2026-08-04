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

/**
 * Set on `<html>` while an expanded page is on screen. Every shell releases its
 * horizontal constraints off this attribute in CSS, in lockstep: Console's gutter and
 * width cap (`page-expanded-*` in globals.css) and Cloud UI's embedded wrapper
 * (`expandableWidth` in cloud-ui layout.tsx). It must never outlive the page — a stale
 * attribute bleeds full width onto the next one.
 */
const PAGE_EXPANDED_ATTR = 'data-page-expanded';

const clearPageExpanded = () => document.documentElement.removeAttribute(PAGE_EXPANDED_ATTR);

const readStoredExpanded = (storageKey: string): boolean => {
  try {
    return localStorage.getItem(storageKey) === 'full';
  } catch {
    return false; // storage blocked (private mode / cookie settings)
  }
};

/**
 * Full-width ("expanded") mode for a work-surface page, in normal document flow.
 * Persisted per browser under `storageKey`.
 *
 * Attach `ref` to the page root: the attribute is held only while that root is on
 * screen, because embedded Cloud UI keeps Console mounted but hidden on host routes.
 */
export function useExpandedPageMode({ storageKey }: { storageKey: string }): {
  expanded: boolean;
  toggleExpanded: () => void;
  ref: (el: HTMLElement | null) => void;
} {
  const [expanded, setExpanded] = useState(() => readStoredExpanded(storageKey));
  // State rather than a ref, so attaching the node re-runs the effect below.
  const [pageRoot, setPageRoot] = useState<HTMLElement | null>(null);

  // Layout effect: the attribute lands in the same frame as the page's own geometry
  // change, so the shells and the page animate together. Its cleanup is the only unset —
  // it covers unmount (navigating away), `ref` detaching and `expanded` flipping off.
  useLayoutEffect(() => {
    if (!pageRoot) {
      return clearPageExpanded;
    }

    // display:none collapses the root to 0x0, which fires the observer — that is the
    // on-screen signal.
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
      } catch {
        // ignore storage failures (private mode / quota)
      }
      return next;
    });
  }, [storageKey]);

  return { expanded, toggleExpanded, ref: setPageRoot };
}
