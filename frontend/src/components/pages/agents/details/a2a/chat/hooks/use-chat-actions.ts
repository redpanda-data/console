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

import type { PromptInputMessage } from 'components/ai-elements/prompt-input';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import { streamMessage } from './use-message-streaming';
import type { ChatMessage } from '../types';
import { clearChatHistory, deleteMessages, saveMessage } from '../utils/database-operations';
import { createErrorMessage, createUserMessage } from '../utils/message-converter';

type UseChatActionsParams = {
  agentId: string;
  agentCardUrl: string;
  model: string | undefined;
  contextId: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setContextSeed: React.Dispatch<React.SetStateAction<string>>;
};

type UseChatActionsResult = {
  isLoading: boolean;
  editingMessageId: string | null;
  handleSubmit: (message: PromptInputMessage) => Promise<void>;
  cancelEdit: () => void;
  clearChat: () => Promise<void>;
  setInput: (input: string) => void;
  input: string;
};

/**
 * Hook to manage chat actions (submit, clear)
 */
export const useChatActions = ({
  agentId,
  agentCardUrl,
  model,
  contextId,
  messages,
  setMessages,
  setContextSeed,
}: UseChatActionsParams): UseChatActionsResult => {
  const [isLoading, setIsLoading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const prompt = message.text?.trim();
      const hasText = Boolean(prompt);
      const hasAttachments = Boolean(message.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }

      // If we're editing a message, clear messages from that point
      if (editingMessageId) {
        const messageIndex = messages.findIndex((msg) => msg.id === editingMessageId);
        if (messageIndex !== -1) {
          setMessages((prev) => prev.slice(0, messageIndex));

          // Delete messages after the edited message from database
          const messagesToDelete = messages.slice(messageIndex);
          const idsToDelete = messagesToDelete.map((msg) => msg.id);
          await deleteMessages(idsToDelete);
        }
        setEditingMessageId(null);
      }

      // Create and add user message
      const userMessage = createUserMessage(prompt || 'Sent with attachments', contextId);
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      // Save user message to database
      await saveMessage(userMessage, agentId);

      // Stream assistant response
      const result = await streamMessage({
        prompt: prompt || 'Sent with attachments',
        agentId,
        agentCardUrl,
        model,
        contextId,
        onMessageUpdate: (updatedMessage) => {
          setMessages((prev) => {
            const messageExists = prev.some((msg) => msg.id === updatedMessage.id);
            if (messageExists) {
              return prev.map((msg) => (msg.id === updatedMessage.id ? updatedMessage : msg));
            }
            return [...prev, updatedMessage];
          });
        },
      });

      // Handle error if streaming failed
      if (!result.success) {
        const errorMessage = createErrorMessage(contextId);
        setMessages((prev) => [...prev, errorMessage]);
        await saveMessage(errorMessage, agentId, { failure: true });
      }

      setIsLoading(false);
    },
    [agentId, agentCardUrl, contextId, editingMessageId, messages, model, setMessages]
  );

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setInput('');
  }, []);

  const clearChat = useCallback(async () => {
    // Clear all messages from state
    setMessages([]);

    // Delete all messages for this context from the database
    await clearChatHistory(agentId, contextId);

    // Generate a new context seed to create a fresh context ID
    setContextSeed(nanoid());
  }, [agentId, contextId, setContextSeed, setMessages]);

  return {
    isLoading,
    editingMessageId,
    handleSubmit,
    cancelEdit,
    clearChat,
    setInput,
    input,
  };
};
