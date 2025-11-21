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

import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';

type ScrollFlag = ScrollBehavior | false;

// Global scroll state (Zustand instead of SWR)
type ScrollState = {
  isAtBottom: boolean;
  scrollBehavior: ScrollFlag;
  autoScrollPaused: boolean;
  setIsAtBottom: (value: boolean) => void;
  setScrollBehavior: (value: ScrollFlag) => void;
  setAutoScrollPaused: (value: boolean) => void;
};

const useScrollStore = create<ScrollState>((set) => ({
  isAtBottom: false,
  scrollBehavior: false,
  autoScrollPaused: false,
  setIsAtBottom: (value) => set({ isAtBottom: value }),
  setScrollBehavior: (value) => set({ scrollBehavior: value }),
  setAutoScrollPaused: (value) => set({ autoScrollPaused: value }),
}));

/**
 * Low-level scroll mechanics hook
 * Provides refs and callbacks for scroll management
 */
export function useScrollToBottom() {
  const endRef = useRef<HTMLDivElement>(null);

  const isAtBottom = useScrollStore((state) => state.isAtBottom);
  const scrollBehavior = useScrollStore((state) => state.scrollBehavior);
  const autoScrollPaused = useScrollStore((state) => state.autoScrollPaused);
  const setIsAtBottom = useScrollStore((state) => state.setIsAtBottom);
  const setScrollBehavior = useScrollStore((state) => state.setScrollBehavior);
  const setAutoScrollPaused = useScrollStore((state) => state.setAutoScrollPaused);

  // Effect watches for scroll trigger and executes
  useEffect(() => {
    if (scrollBehavior) {
      endRef.current?.scrollIntoView({ behavior: scrollBehavior });
      setScrollBehavior(false);
    }
  }, [scrollBehavior, setScrollBehavior]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      setScrollBehavior(behavior);
    },
    [setScrollBehavior]
  );

  const onViewportEnter = useCallback(() => {
    setIsAtBottom(true);
    // Re-enable autoscroll when user manually scrolls back to bottom
    setAutoScrollPaused(false);
  }, [setIsAtBottom, setAutoScrollPaused]);

  const onViewportLeave = useCallback(() => {
    setIsAtBottom(false);
    // Disable autoscroll when user scrolls away from bottom
    setAutoScrollPaused(true);
  }, [setIsAtBottom, setAutoScrollPaused]);

  return {
    endRef,
    isAtBottom,
    autoScrollPaused,
    scrollToBottom,
    setAutoScrollPaused,
    onViewportEnter,
    onViewportLeave,
  };
}
