// Copyright 2026 Redpanda Data, Inc.

import { type RefObject, useLayoutEffect, useState } from 'react';

export interface Bounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface ItemMetadata {
  activeClassName: string;
  disabled: boolean;
  forceUpdateBounds: boolean | undefined;
  value: string;
}

interface Attachment {
  element: HTMLDivElement;
  metadata: ItemMetadata;
}

export type RegisterHighlightItem = (element: HTMLDivElement, metadata: ItemMetadata) => () => void;

interface ParentGeometry {
  activeClassName: string;
  bounds: Bounds;
}

function createItemRegistry() {
  const items = new Map<HTMLDivElement, ItemMetadata>();
  let listener: (() => void) | undefined;
  let queued: (() => void) | undefined;
  const scheduleMeasurement = () => {
    if (queued !== undefined) {
      return;
    }
    // React may replace a callback ref without replacing its element. Read the
    // final attachment set after that commit, not the transient detached set.
    const notify = () => {
      if (queued === notify) {
        queued = undefined;
        listener?.();
      }
    };
    queued = notify;
    queueMicrotask(notify);
  };
  const register: RegisterHighlightItem = (element, metadata) => {
    items.set(element, metadata);
    scheduleMeasurement();
    return () => {
      if (items.get(element) === metadata) {
        items.delete(element);
        scheduleMeasurement();
      }
    };
  };
  return {
    items,
    register,
    measure: () => {
      queued = undefined;
      listener?.();
    },
    subscribe: (nextListener: () => void) => {
      listener = nextListener;
      return () => {
        if (listener === nextListener) {
          listener = undefined;
        }
      };
    },
  };
}

function firstActiveAttachment(
  items: Map<HTMLDivElement, ItemMetadata>,
  container: HTMLDivElement,
  value: string | null
): Attachment | undefined {
  if (value === null || value === '') {
    return;
  }
  let first: Attachment | undefined;
  for (const [element, metadata] of items) {
    if (!(element.isConnected && container.contains(element)) || metadata.disabled || metadata.value !== value) {
      continue;
    }
    if (
      first === undefined ||
      element.compareDocumentPosition(first.element) === Node.DOCUMENT_POSITION_FOLLOWING ||
      element.compareDocumentPosition(first.element) ===
        Node.DOCUMENT_POSITION_FOLLOWING + Node.DOCUMENT_POSITION_CONTAINED_BY
    ) {
      first = { element, metadata };
    }
  }
  return first;
}

function sameGeometry(previous: ParentGeometry | null, next: ParentGeometry | null): boolean {
  if (previous === null || next === null) {
    return previous === next;
  }
  return (
    previous.activeClassName === next.activeClassName &&
    previous.bounds.left === next.bounds.left &&
    previous.bounds.top === next.bounds.top &&
    previous.bounds.width === next.bounds.width &&
    previous.bounds.height === next.bounds.height
  );
}

function readGeometry(
  container: HTMLDivElement,
  target: Attachment | undefined,
  offset: Partial<Bounds> | undefined
): ParentGeometry | null {
  if (target === undefined) {
    return null;
  }
  const bounds = target.element.getBoundingClientRect();
  const parentBounds = container.getBoundingClientRect();
  const { left = 0, top = 0, width = 0, height = 0 } = offset ?? {};
  return {
    activeClassName: target.metadata.activeClassName,
    bounds: {
      left: bounds.left - parentBounds.left - container.clientLeft + container.scrollLeft + left,
      top: bounds.top - parentBounds.top - container.clientTop + container.scrollTop + top,
      width: bounds.width + width,
      height: bounds.height + height,
    },
  };
}

function createFrameFollower(onFrame: () => void) {
  let frame: number | undefined;
  const stop = () => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  };
  return {
    stop,
    update: (enabled: boolean) => {
      if (enabled) {
        frame ??= requestAnimationFrame(() => {
          frame = undefined;
          onFrame();
        });
      } else {
        stop();
      }
    },
  };
}

interface ParentLayoutOptions {
  activeValue: string | null;
  boundsOffset: Partial<Bounds> | undefined;
  enabled: boolean;
  forceUpdateBounds: boolean | undefined;
  mode: 'children' | 'parent';
}

function observeGeometry(
  container: HTMLDivElement,
  registry: ReturnType<typeof createItemRegistry>,
  {
    activeValue,
    boundsOffset,
    forceUpdateBounds,
  }: Pick<ParentLayoutOptions, 'activeValue' | 'boundsOffset' | 'forceUpdateBounds'>,
  onGeometry: (geometry: ParentGeometry | null) => void
) {
  let stopped = false;
  let observedTarget: HTMLDivElement | undefined;
  let lastMeasurement: ParentGeometry | null | undefined;
  const resizeObserver = new ResizeObserver(measure);
  const frameFollower = createFrameFollower(measure);
  const observeTarget = (element: HTMLDivElement | undefined) => {
    if (element === observedTarget) {
      return;
    }
    observedTarget = element;
    resizeObserver.disconnect();
    resizeObserver.observe(container);
    if (element !== undefined) {
      resizeObserver.observe(element);
    }
  };
  function measure() {
    if (stopped) {
      return;
    }
    const target = firstActiveAttachment(registry.items, container, activeValue);
    observeTarget(target?.element);
    const next = readGeometry(container, target, boundsOffset);
    if (lastMeasurement === undefined || !sameGeometry(lastMeasurement, next)) {
      lastMeasurement = next;
      onGeometry(next);
    }
    frameFollower.update(target !== undefined && (target.metadata.forceUpdateBounds ?? forceUpdateBounds) === true);
  }
  const unsubscribe = registry.subscribe(measure);
  resizeObserver.observe(container);
  container.addEventListener('scroll', measure, { capture: true, passive: true });
  const viewport = container.ownerDocument.defaultView;
  viewport?.addEventListener('resize', measure, { passive: true });
  measure();
  return () => {
    stopped = true;
    unsubscribe();
    resizeObserver.disconnect();
    container.removeEventListener('scroll', measure, true);
    viewport?.removeEventListener('resize', measure);
    frameFollower.stop();
  };
}

/** One parent owns attachment selection, native geometry and all subscriptions. */
export function useParentHighlightLayout(
  containerRef: RefObject<HTMLDivElement | null>,
  { activeValue, boundsOffset, enabled, forceUpdateBounds, mode }: ParentLayoutOptions
) {
  const [registry] = useState(createItemRegistry);
  const [geometry, setGeometry] = useState<ParentGeometry | null>(null);

  useLayoutEffect(
    function observeParentGeometry() {
      const container = containerRef.current;
      if (mode !== 'parent' || !enabled || container === null) {
        return;
      }
      return observeGeometry(container, registry, { activeValue, boundsOffset, forceUpdateBounds }, (next) => {
        setGeometry((previous) => (sameGeometry(previous, next) ? previous : next));
      });
    },
    [activeValue, boundsOffset, containerRef, enabled, forceUpdateBounds, mode, registry]
  );

  useLayoutEffect(function measureCommittedParentLayout() {
    registry.measure();
  });

  return { geometry, registerItem: registry.register };
}
