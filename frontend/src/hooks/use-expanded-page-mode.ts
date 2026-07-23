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

import { useCallback, useRef, useState } from 'react';
import { setPageExpanded } from 'utils/page-expanded';

export type ExpandedPageMode = 'boxed' | 'full';

const readStoredMode = (storageKey: string): ExpandedPageMode => {
  try {
    return localStorage.getItem(storageKey) === 'full' ? 'full' : 'boxed';
  } catch {
    return 'boxed'; // storage blocked (private mode / cookie settings)
  }
};

/**
 * Fullscreen ("expanded") mode for a work-surface page, in normal document flow:
 * while expanded and on screen, stamps `data-page-expanded` on `<html>` so the
 * shells release their horizontal constraints. Persists under `storageKey`.
 *
 * Attach `ref` to the page root — the attribute is held only while the root is
 * visible (embedded Cloud UI keeps Console mounted but hidden on host routes).
 */
export function useExpandedPageMode({ storageKey }: { storageKey: string }): {
  expanded: boolean;
  toggleExpanded: () => void;
  ref: (el: HTMLElement | null) => void;
} {
  const [mode, setMode] = useState<ExpandedPageMode>(() => readStoredMode(storageKey));
  const modeRef = useRef(mode);
  const elRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const sync = useCallback(() => {
    const el = elRef.current;
    const visible = el !== null && el.getClientRects().length > 0;
    setPageExpanded(visible && modeRef.current === 'full');
  }, []);

  // display:none collapses the root to 0x0, firing the ResizeObserver — that's the
  // visibility signal.
  const ref = useCallback(
    (el: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      elRef.current = el;
      if (el) {
        observerRef.current = new ResizeObserver(sync);
        observerRef.current.observe(el);
      }
      sync();
    },
    [sync]
  );

  const toggleExpanded = useCallback(() => {
    const next: ExpandedPageMode = modeRef.current === 'full' ? 'boxed' : 'full';
    modeRef.current = next;
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // ignore storage failures (private mode / quota)
    }
    // Same-tick stamp so the shells and the page's own styling animate together.
    sync();
    setMode(next);
  }, [storageKey, sync]);

  return { expanded: mode === 'full', toggleExpanded, ref };
}
