'use client';

import React from 'react';

import { useScrollShadow } from '../lib/use-scroll-shadow';
import { cn, type SharedProps } from '../lib/utils';

// Drag past this many px counts as a scroll, not a click.
const DRAG_THRESHOLD = 4;

// Default width of the edge fade, also the inset a focused child is scrolled clear of.
const DEFAULT_FADE_SIZE = 32;

// Manual horizontal scroll (not `scrollIntoView`) so the page's vertical scroll isn't disturbed.
function scrollChildIntoView(scroller: HTMLDivElement, child: HTMLElement, fadeSize: number) {
  const view = scroller.getBoundingClientRect();
  const rect = child.getBoundingClientRect();
  // Inset by the fade so the child clears the gradient, not just the frame edge.
  if (rect.left < view.left + fadeSize) {
    scroller.scrollLeft -= view.left + fadeSize - rect.left;
  } else if (rect.right > view.right - fadeSize) {
    scroller.scrollLeft += rect.right - (view.right - fadeSize);
  }
}

// Scroll any focused descendant into view via `focusin` — agnostic to the children, so roving
// keyboard focus, toolbars, and chip rows all work.
function useFocusScroll(ref: React.RefObject<HTMLDivElement | null>, fadeSize: number) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && el.contains(target)) {
        scrollChildIntoView(el, target, fadeSize);
      }
    };
    el.addEventListener('focusin', onFocusIn);
    return () => el.removeEventListener('focusin', onFocusIn);
  }, [ref, fadeSize]);
}

// Click-and-drag horizontal scrolling; a real drag swallows the trailing click.
function useDragScroll(ref: React.RefObject<HTMLDivElement | null>) {
  const drag = React.useRef<{ x: number; left: number } | null>(null);
  const dragged = React.useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.button !== 0) {
      return;
    }
    drag.current = { x: e.clientX, left: el.scrollLeft };
    dragged.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const start = drag.current;
    if (!(el && start)) {
      return;
    }
    const dx = e.clientX - start.x;
    // Stay a click until the pointer crosses the threshold; only then capture and scroll, so a
    // sub-threshold wobble never nudges the strip.
    if (!dragged.current && Math.abs(dx) <= DRAG_THRESHOLD) {
      return;
    }
    dragged.current = true;
    if (typeof el.setPointerCapture === 'function' && !el.hasPointerCapture(e.pointerId)) {
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = start.left - dx;
  };
  const onPointerEnd = () => {
    drag.current = null;
  };
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    // Swallow only the pointer-driven click that ends a real drag. Keyboard activation (Enter/Space)
    // produces a `detail === 0` click, so it always passes — even if a prior drag left `dragged` set.
    if (dragged.current && e.detail > 0) {
      e.preventDefault();
      e.stopPropagation();
    }
    dragged.current = false;
  };
  return { onPointerDown, onPointerMove, onPointerEnd, onClickCapture };
}

type MaskStyle = Pick<React.CSSProperties, 'maskImage' | 'WebkitMaskImage' | 'maskComposite' | 'WebkitMaskComposite'>;

// Alpha mask fading the content to transparent on the overflowing side(s) — no track-color
// knowledge needed, so it blends on any background. Snaps when an edge flips (reduced-motion-safe).
// `preserveBottomEdge` keeps the bottom N px opaque (e.g. an underline baseline) by unioning a
// second layer with `mask-composite: add` (legacy WebKit spells `add` as `source-over`).
function edgeMask(start: boolean, end: boolean, fadeSize: number, preserveBottomEdge: number): MaskStyle {
  if (!(start || end)) {
    return {};
  }
  const left = start ? `transparent 0, #000 ${fadeSize}px` : '#000 0';
  const right = end ? `#000 calc(100% - ${fadeSize}px), transparent 100%` : '#000 100%';
  const horizontal = `linear-gradient(to right, ${left}, ${right})`;

  if (!preserveBottomEdge) {
    return { maskImage: horizontal, WebkitMaskImage: horizontal };
  }
  const bottom = `linear-gradient(to top, #000 ${preserveBottomEdge}px, transparent ${preserveBottomEdge}px)`;
  const image = `${horizontal}, ${bottom}`;
  return { maskImage: image, WebkitMaskImage: image, maskComposite: 'add', WebkitMaskComposite: 'source-over' };
}

type DragScrollAreaProps = React.ComponentProps<'div'> &
  SharedProps & {
    // Width of the edge fade in px, and the inset a focused child is scrolled clear of.
    fadeSize?: number;
    // Keep the bottom N px fully opaque, exempt from the edge fade (e.g. an underline baseline).
    preserveBottomEdge?: number;
  };

/**
 * Makes an overflowing horizontal strip drag-scrollable, with alpha edge fades and
 * keyboard-focus-into-view. Wrap any single-row content that can overflow its container
 * (tab strips, toolbars, chip rows). Horizontal only by design.
 */
function DragScrollArea({
  className,
  children,
  fadeSize = DEFAULT_FADE_SIZE,
  preserveBottomEdge = 0,
  testId,
  style,
  ...props
}: DragScrollAreaProps) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const edges = useScrollShadow(scrollerRef, true, 'horizontal');
  const drag = useDragScroll(scrollerRef);
  useFocusScroll(scrollerRef, fadeSize);

  const mask = edgeMask(edges.start, edges.end, fadeSize, preserveBottomEdge);
  const overflowing = edges.start || edges.end;

  return (
    // `{...props}` first so the drag handlers, ref, and mask can't be clobbered by a consumer.
    <div
      {...props}
      className={cn(
        // `min-w-0` lets the area shrink below its content (and thus overflow) inside flex parents.
        'min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        overflowing && 'cursor-grab active:cursor-grabbing',
        className
      )}
      data-slot="drag-scroll-area"
      data-testid={testId}
      onClickCapture={drag.onClickCapture}
      onPointerDown={drag.onPointerDown}
      onPointerLeave={drag.onPointerEnd}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerEnd}
      ref={scrollerRef}
      style={{ ...mask, ...style }}
    >
      {children}
    </div>
  );
}

export { DragScrollArea, type DragScrollAreaProps };
