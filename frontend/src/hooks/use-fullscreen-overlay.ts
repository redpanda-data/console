/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { isEmbedded } from 'config';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

/**
 * A workspace-style page layout mode. 'boxed' caps the page to the standard
 * content width like every other page; 'full' is edge-to-edge. Persisted per
 * browser. Shared by the SQL studio and the RPCN pipeline editor.
 */
export type OverlayMode = 'boxed' | 'full';

// Generic cloud-ui shell contract: any embedded page that sets this <html>
// attribute makes the layout wrapper (and the breadcrumb header inside it)
// animate to full width via CSS — see cloud-ui layout.tsx `expandableWidth`.
// Presence = expanded. Set synchronously with the page's own geometry change
// so the wrapper and the page animate in lockstep.
const PAGE_EXPANDED_ATTR = 'data-page-expanded';
const DEFAULT_MAX_WIDTH = 1500; // boxed mode caps to the standard page column
const SIDE_GAP = 40; // boxed inset from the centered max-width column
const TOP_GAP = 16; // boxed gap between the breadcrumb header and the page header; full mode has none
const BOTTOM_GAP = 32;
const EASE = '0.3s cubic-bezier(0.4, 0, 0.2, 1)';
const SCROLLABLE_OVERFLOW_RE = /(auto|scroll)/;
// Root animates geometry only; the body card animates its own border/radius/shadow
// via Tailwind (same easing/duration) so the page header stays outside the box.
const TRANSITION = `top ${EASE}, left ${EASE}, right ${EASE}, bottom ${EASE}`;

const readMode = (storageKey: string, fallback: OverlayMode): OverlayMode => {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (stored === 'full' || stored === 'boxed') {
      return stored;
    }
  } catch {
    // ignore storage failures (private mode / quota)
  }
  return fallback;
};

const setPageExpanded = (expanded: boolean) => {
  const root = document.documentElement;
  if (expanded) {
    root.setAttribute(PAGE_EXPANDED_ATTR, '');
  } else {
    root.removeAttribute(PAGE_EXPANDED_ATTR);
  }
};

// Renders the workspace as a fixed overlay filling the area right of the
// cluster sidebar, below the page header. This gives a true full-width,
// full-height editor WITHOUT mutating any shared cloud-ui layout nodes — so it
// never leaves residue on other pages (e.g. Overview) when you navigate away.
// Works in both standalone console and embedded cloud-ui. `getMode` is read on
// every layout pass so a mode toggle re-runs geometry; returns teardown +
// relayout (the latter called by the component when the mode changes).
function setupOverlayLayout(
  el: HTMLDivElement,
  getMode: () => OverlayMode,
  maxWidth: number
): { relayout: () => void; teardown: () => void } {
  // Natural (in-flow) top sits just below the page header. Measured once
  // while still in flow; horizontal resizes don't change it.
  const naturalTop = el.getBoundingClientRect().top;

  const findRegionLeft = () => {
    // The content region is the INNERMOST ancestor that spans to the
    // viewport's right edge — i.e. the main column right of the sidebar.
    // (Outer ancestors like the sidebar wrapper also reach the right edge but
    // start at x=0 and would put the editor under the sidebar.)
    let node = el.parentElement;
    while (node && node !== document.body) {
      const r = node.getBoundingClientRect();
      if (Math.abs(r.right - window.innerWidth) <= 2 && r.width > 200) {
        return r.left;
      }
      node = node.parentElement;
    }
    return el.getBoundingClientRect().left;
  };

  const layout = () => {
    const regionLeft = findRegionLeft();
    el.style.position = 'fixed';
    el.style.height = 'auto';
    if (getMode() === 'full') {
      // Edge-to-edge: fill the region right of the sidebar, flush under the header.
      el.style.top = `${naturalTop}px`;
      el.style.left = `${regionLeft}px`;
      el.style.right = '0px';
      el.style.bottom = '0px';
      return;
    }
    // Boxed: centre a max-width column in the region, inset by the side gap, with a
    // bottom gap. Standalone adds a top gap below the thin breadcrumb; embedded
    // skips it because the cloud-ui shell's own header spacing already supplies the
    // gap. The card border/radius/shadow live on the body element, so the page
    // header sits outside the box.
    const regionWidth = window.innerWidth - regionLeft;
    const capped = Math.min(maxWidth, regionWidth);
    const centeredLeft = regionLeft + (regionWidth - capped) / 2;
    el.style.top = `${naturalTop + (isEmbedded() ? 0 : TOP_GAP)}px`;
    el.style.left = `${centeredLeft + SIDE_GAP}px`;
    el.style.right = `${window.innerWidth - (centeredLeft + capped) + SIDE_GAP}px`;
    el.style.bottom = `${BOTTOM_GAP}px`;
  };

  // The overlay is fixed, but the host page (cloud-ui chrome when embedded)
  // still scrolls behind it — dragging the host page header up/down/sideways
  // while the pinned editor stays put. Lock every scrollable ancestor (plus
  // the document scroller) so nothing behind the overlay can scroll, keeping
  // the host header static. No-op in standalone console, where nothing scrolls.
  const locked: Array<{ node: HTMLElement; overflow: string }> = [];
  const lock = (node: HTMLElement) => {
    locked.push({ node, overflow: node.style.overflow });
    node.style.overflow = 'hidden';
  };
  const lockAll = () => {
    let node: HTMLElement | null = el.parentElement;
    while (node && node !== document.body) {
      const c = getComputedStyle(node);
      const scrollable = SCROLLABLE_OVERFLOW_RE.test(c.overflowY + c.overflowX);
      if (scrollable && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) {
        lock(node);
      }
      node = node.parentElement;
    }
    const scroller = (document.scrollingElement ?? document.documentElement) as HTMLElement;
    lock(scroller);
    if (document.body) {
      lock(document.body);
    }
  };
  const unlockAll = () => {
    for (const { node, overflow } of locked) {
      node.style.overflow = overflow;
    }
    locked.length = 0;
  };

  // When embedded, the host keeps Console MOUNTED but display:none while on
  // its own routes (e.g. /overview) — unmount cleanup never runs there, which
  // would strand the scroll locks on a page that needs to scroll. Hold the
  // locks only while actually on screen: display:none collapses the overlay
  // to 0x0, which fires the ResizeObserver, and we release until shown again.
  const isVisible = () => el.getClientRects().length > 0;
  let active = false;
  const sync = () => {
    if (isVisible() && !active) {
      layout();
      lockAll();
      // Re-assert the host expand attr on show — embedded cloud-ui keeps Console
      // mounted+hidden, so this is the lifecycle that owns the attribute.
      setPageExpanded(getMode() === 'full');
      active = true;
    } else if (!isVisible() && active) {
      unlockAll();
      // Clear it on hide so other cloud-ui pages don't render stuck full-width.
      setPageExpanded(false);
      active = false;
    }
  };
  sync();
  const visibilityObserver = new ResizeObserver(sync);
  visibilityObserver.observe(el);

  // Enable transitions one frame after first geometry so the initial mount
  // snaps into place instead of animating from the unstyled position.
  let transitionsReady = false;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      el.style.transition = TRANSITION;
      transitionsReady = true;
    })
  );

  const onWindowResize = () => {
    if (!active) {
      return;
    }
    // Reposition instantly during resize — animating every resize tick trails.
    if (transitionsReady) {
      el.style.transition = 'none';
    }
    layout();
    if (transitionsReady) {
      requestAnimationFrame(() => {
        el.style.transition = TRANSITION;
      });
    }
  };
  window.addEventListener('resize', onWindowResize);

  return {
    relayout: () => {
      if (active) {
        layout();
      }
    },
    teardown: () => {
      visibilityObserver.disconnect();
      window.removeEventListener('resize', onWindowResize);
      if (active) {
        unlockAll();
      }
      // Drop the inline fixed-positioning we applied so the element returns to normal
      // flow. Harmless on unmount (SQL); required when a consumer toggles the pin off
      // (RPCN full → boxed) and keeps the element mounted.
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.height = '';
      el.style.transition = '';
    },
  };
}

type UseFullscreenOverlayOptions = {
  /** localStorage key the chosen mode is persisted under (per page). */
  storageKey: string;
  /** Mode used when nothing is persisted yet. Defaults to 'boxed'. */
  defaultMode?: OverlayMode;
  /** Boxed-mode max content width in px. Defaults to 1500. */
  maxWidth?: number;
  /** Run when the overlay attaches (e.g. populate the standalone page header). */
  onAttach?: () => void;
};

/**
 * Workspace fullscreen layout mode + the callback ref that wires it to the
 * imperative overlay. The ref mirrors the mode so the overlay (set up once)
 * reads the latest value during async relayouts; toggleMode drives the geometry
 * change directly — react state only mirrors it so the toggle button's icon
 * re-renders.
 *
 * Attach the returned `attachOverlay` ref to the page's root element. Apply the
 * boxed/full card styling (border, radius, shadow) to the body element yourself
 * off the returned `mode`, so the page header stays outside the box.
 */
export function useFullscreenOverlay({
  storageKey,
  defaultMode = 'boxed',
  maxWidth = DEFAULT_MAX_WIDTH,
  onAttach,
}: UseFullscreenOverlayOptions): {
  attachOverlay: (el: HTMLDivElement | null) => void;
  mode: OverlayMode;
  toggleMode: () => void;
} {
  const [mode, setMode] = useState<OverlayMode>(() => readMode(storageKey, defaultMode));
  const modeRef = useRef(mode);
  const overlayCleanup = useRef<(() => void) | null>(null);
  const overlayRelayout = useRef<(() => void) | null>(null);
  // Hold the latest options in refs so the identity-stable attachOverlay reads
  // current values without being recreated (which would detach the overlay).
  const onAttachRef = useRef(onAttach);
  onAttachRef.current = onAttach;
  const maxWidthRef = useRef(maxWidth);
  maxWidthRef.current = maxWidth;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  // Callback ref (no effect): React calls it with the node on mount and null
  // on unmount, which maps 1:1 onto the overlay's setup/teardown. Must be
  // identity-stable, or React would detach/reattach the overlay every render.
  const attachOverlay = useCallback((el: HTMLDivElement | null) => {
    overlayCleanup.current?.();
    if (el) {
      // Reflect the mode for the cloud-ui shell while the page is mounted, and
      // clear it on unmount so it leaves no residue on other pages.
      setPageExpanded(modeRef.current === 'full');
      onAttachRef.current?.();
      const handle = setupOverlayLayout(el, () => modeRef.current, maxWidthRef.current);
      overlayCleanup.current = handle.teardown;
      overlayRelayout.current = handle.relayout;
    } else {
      setPageExpanded(false);
      overlayCleanup.current = null;
      overlayRelayout.current = null;
    }
  }, []);

  const toggleMode = useCallback(() => {
    const next: OverlayMode = modeRef.current === 'boxed' ? 'full' : 'boxed';
    modeRef.current = next;
    try {
      localStorage.setItem(storageKeyRef.current, next);
    } catch {
      // ignore storage failures (private mode / quota)
    }
    // Update the <html> attr and the page geometry in the same synchronous
    // tick: the cloud-ui shell's wrapper transitions off the attr via CSS while
    // the overlay transitions its inline geometry, so both animate together.
    setPageExpanded(next === 'full');
    overlayRelayout.current?.();
    setMode(next);
  }, []);

  return { attachOverlay, mode, toggleMode };
}

/**
 * Lighter sibling of {@link useFullscreenOverlay}: tracks the same persisted boxed/full
 * mode but does NOT itself touch layout. Pair it with {@link useFullscreenPin} so the page
 * lives in normal document flow when boxed (it can grow and page-scroll) and pins as a
 * fixed overlay only when full — e.g. the RPCN pipeline editor, where boxed gives a
 * comfortable scrollable panel and full goes edge-to-edge.
 */
export function usePageWidthMode({
  storageKey,
  defaultMode = 'boxed',
}: {
  storageKey: string;
  defaultMode?: OverlayMode;
}): { mode: OverlayMode; toggleMode: () => void } {
  const [mode, setMode] = useState<OverlayMode>(() => readMode(storageKey, defaultMode));

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next: OverlayMode = prev === 'boxed' ? 'full' : 'boxed';
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // ignore storage failures (private mode / quota)
      }
      return next;
    });
  }, [storageKey]);

  return { mode, toggleMode };
}

/**
 * Pins the attached element as the fixed full-screen overlay (edge-to-edge, in the region
 * right of the sidebar) while `enabled`. When disabled the element stays in normal document
 * flow, so the page can grow and scroll. Attach the returned ref to the page root and drive
 * `enabled` from the boxed/full mode. The overlay's geometry/scroll-lock and the cloud-ui
 * `data-page-expanded` width hint are set up while pinned and fully torn down when not.
 */
export function useFullscreenPin(enabled: boolean): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!(enabled && el)) {
      return;
    }
    const handle = setupOverlayLayout(el, () => 'full', DEFAULT_MAX_WIDTH);
    return () => {
      handle.teardown();
      setPageExpanded(false);
    };
  }, [enabled]);
  return ref;
}
