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

import { nanoid } from 'nanoid';
import { useEffect, useMemo, useState } from 'react';

import type { ChatMessage } from '../types';
import { loadMessages } from '../utils/database-operations';

type UseChatMessagesResult = {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  contextId: string;
  contextSeed: string;
  setContextSeed: React.Dispatch<React.SetStateAction<string>>;
  isLoadingHistory: boolean;
};

/**
 * Hook to manage chat messages and context
 */
export const useChatMessages = (agentId: string): UseChatMessagesResult => {
  // Use a stable contextSeed - only generate once per agent, persists across reloads
  // Only changes when user explicitly clears chat via setContextSeed
  const [contextSeed, setContextSeed] = useState<string>(() => {
    // Try to load from localStorage first
    const storageKey = `agent-context-seed-${agentId}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }
    // Generate new seed and store it
    const newSeed = nanoid();
    localStorage.setItem(storageKey, newSeed);
    return newSeed;
  });

  const contextId = useMemo(() => `agent-chat-${agentId}-${contextSeed}`, [agentId, contextSeed]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Update localStorage when contextSeed changes
  useEffect(() => {
    const storageKey = `agent-context-seed-${agentId}`;
    localStorage.setItem(storageKey, contextSeed);
  }, [agentId, contextSeed]);

  // Load messages from database on mount or when context changes
  useEffect(() => {
    async function loadChatMessages() {
      setIsLoadingHistory(true);
      try {
        const loadedMessages = await loadMessages(agentId, contextId);
        setMessages(loadedMessages);
      } catch {
        // Error loading messages - silently fail and show empty state
      } finally {
        setIsLoadingHistory(false);
      }
    }

    // biome-ignore lint/nursery/noFloatingPromises: Fire-and-forget with internal error handling
    loadChatMessages();
  }, [agentId, contextId]);

  return {
    messages,
    setMessages,
    contextId,
    contextSeed,
    setContextSeed,
    isLoadingHistory,
  };
};
