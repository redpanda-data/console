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

import { useEffect } from 'react';

import { useScrollToBottom } from './use-scroll-to-bottom';

/**
 * Chat-specific scroll orchestration hook
 * Composes useScrollToBottom with chat lifecycle logic
 */
export function useChatScroll({
  agentId,
  isLoading,
  isStreaming,
  messages,
}: {
  agentId: string;
  isLoading: boolean;
  isStreaming: boolean;
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

  // Auto-scroll to bottom when agent changes (instant, no animation)
  useEffect(() => {
    if (agentId) {
      scrollToBottom('smooth');
    }
  }, [agentId, scrollToBottom]);

  // Auto-scroll on message updates during streaming
  // When streaming is active and auto-scroll is enabled, always scroll to bottom
  // When not streaming, only scroll if user is already at bottom
  useEffect(() => {
    if (messages.length > 0) {
      if (isStreaming && !autoScrollPaused) {
        // Force scroll during streaming when auto-scroll is enabled
        scrollToBottom('smooth');
      } else if (isLoading && isAtBottom) {
        // Original behavior for non-streaming updates
        scrollToBottom('smooth');
      }
    }
  }, [messages, isLoading, isStreaming, isAtBottom, autoScrollPaused, scrollToBottom]);

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
