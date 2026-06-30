import { TabsList } from 'components/redpanda-ui/components/tabs';
import { cn } from 'components/redpanda-ui/lib/utils';
import {
  type ComponentProps,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

// Drag past this many px counts as a scroll (and cancels the trailing tab-activating click).
const DRAG_THRESHOLD = 4;

// Tracks hidden content left/right of the scroller, to fade only edges with more to reveal.
function useScrollEdges(ref: RefObject<HTMLDivElement | null>) {
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild);
    }
    return () => observer.disconnect();
  }, [ref, update]);
  return { edges, update };
}

// Click-and-drag horizontal scrolling for trackpad-less pointers; a real drag swallows the
// trailing click so releasing on a tab doesn't activate it.
function useDragScroll(ref: RefObject<HTMLDivElement | null>) {
  const drag = useRef<{ x: number; left: number } | null>(null);
  const dragged = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.button !== 0) {
      return;
    }
    drag.current = { x: e.clientX, left: el.scrollLeft };
    dragged.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const start = drag.current;
    if (!(el && start)) {
      return;
    }
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > DRAG_THRESHOLD) {
      dragged.current = true;
      if (typeof el.setPointerCapture === 'function' && !el.hasPointerCapture(e.pointerId)) {
        el.setPointerCapture(e.pointerId);
      }
    }
    el.scrollLeft = start.left - dx;
  };
  const onPointerEnd = () => {
    drag.current = null;
  };
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (dragged.current) {
      e.preventDefault();
      e.stopPropagation();
      dragged.current = false;
    }
  };
  return { onPointerDown, onPointerMove, onPointerEnd, onClickCapture };
}

// Drag-scrollable horizontal tab strip with edge-fade affordances. Wraps the registry
// TabsList so the registry component itself stays unmodified (survives upstream re-syncs).
export function ScrollableTabsList({ className, ...props }: ComponentProps<typeof TabsList>) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const { edges, update } = useScrollEdges(scrollerRef);
  const drag = useDragScroll(scrollerRef);

  return (
    <div className="relative min-w-0" data-slot="tabs-list-scroll-area">
      {/* pb-px so the scroll clip doesn't cut the active underline's overhang. */}
      <div
        className="cursor-grab overflow-x-auto overscroll-x-contain pb-px [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
        onClickCapture={drag.onClickCapture}
        onPointerDown={drag.onPointerDown}
        onPointerLeave={drag.onPointerEnd}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerEnd}
        onScroll={update}
        ref={scrollerRef}
      >
        {/* w-max so the strip sizes to content and can overflow; min-w-full keeps the underline spanning the frame. */}
        <TabsList className={cn('w-max min-w-full', className)} {...props} />
      </div>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent transition-opacity duration-200',
          edges.left ? 'opacity-100' : 'opacity-0'
        )}
        data-slot="tabs-list-fade-left"
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent transition-opacity duration-200',
          edges.right ? 'opacity-100' : 'opacity-0'
        )}
        data-slot="tabs-list-fade-right"
      />
    </div>
  );
}
