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

import { useEffect, useRef } from 'react';

import { useScrollToBottom } from './use-scroll-to-bottom';

/**
 * Chat-specific scroll orchestration hook
 * Composes useScrollToBottom with chat lifecycle logic
 */
export function useChatScroll({
  agentId,
  isLoading,
  messages,
}: {
  agentId: string;
  isLoading: boolean;
  messages: unknown[];
}) {
  const {
    endRef,
    isAtBottom,
    autoScrollPaused,
    scrollToBottom,
    setAutoScrollPaused,
    onViewportEnter,
    onViewportLeave,
  } = useScrollToBottom();

  // Auto-scroll to bottom when agent changes
  useEffect(() => {
    if (agentId) {
      scrollToBottom('smooth');
    }
  }, [agentId, scrollToBottom]);

  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll on message updates during streaming (including task state updates)
  useEffect(() => {
    if (messages.length > 0 && isLoading && !autoScrollPaused) {
      // Debounce scroll to avoid zigzag - only scroll after changes settle
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => scrollToBottom('instant'), 10);
    }
  }, [messages, isLoading, autoScrollPaused, scrollToBottom]);

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
