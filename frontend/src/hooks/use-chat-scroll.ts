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
  messages,
}: {
  agentId: string;
  isLoading: boolean;
  messages: unknown[];
}) {
  const { endRef, isAtBottom, scrollToBottom, onViewportEnter, onViewportLeave } = useScrollToBottom();

  // Auto-scroll to bottom when agent changes (instant, no animation)
  useEffect(() => {
    if (agentId) {
      scrollToBottom('smooth');
    }
  }, [agentId, scrollToBottom]);

  // Auto-scroll on message updates during streaming
  // Ensures scroll follows content as it's added incrementally
  useEffect(() => {
    if (isLoading && isAtBottom && messages.length > 0) {
      scrollToBottom('smooth');
    }
  }, [messages, isLoading, isAtBottom, scrollToBottom]);

  return {
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
  };
}
