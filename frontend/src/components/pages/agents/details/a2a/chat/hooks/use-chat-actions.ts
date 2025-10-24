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
  regenerate: () => Promise<void>;
  editMessage: (messageId: string, textareaRef: React.RefObject<HTMLTextAreaElement>) => void;
  cancelEdit: () => void;
  clearChat: () => Promise<void>;
  setInput: (input: string) => void;
  input: string;
};

/**
 * Hook to manage chat actions (submit, regenerate, edit, clear)
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

  const regenerate = useCallback(async () => {
    // Find the last user message
    const lastUserMessageIndex = messages.findLastIndex((msg) => msg.role === 'user');
    if (lastUserMessageIndex === -1) {
      return;
    }

    const lastUserMessage = messages[lastUserMessageIndex];
    // Extract text from contentBlocks
    const textBlock = lastUserMessage.contentBlocks?.find((block) => block.type === 'text');
    const text = textBlock?.text || '';

    // Get messages to remove (all messages after the last user message)
    const messagesToRemove = messages.slice(lastUserMessageIndex + 1);
    const idsToDelete = messagesToRemove.map((msg) => msg.id);

    // Remove all messages after the last user message
    setMessages((prev) => prev.slice(0, lastUserMessageIndex + 1));

    // Delete from database
    await deleteMessages(idsToDelete);

    // Resubmit the last user message
    void handleSubmit({ text });
  }, [messages, handleSubmit, setMessages]);

  const editMessage = useCallback(
    (messageId: string, textareaRef: React.RefObject<HTMLTextAreaElement>) => {
      // Find the message to edit
      const messageIndex = messages.findIndex((msg) => msg.id === messageId);
      if (messageIndex === -1) {
        return;
      }

      const messageToEdit = messages[messageIndex];
      // Extract text from contentBlocks
      const textBlock = messageToEdit.contentBlocks?.find((block) => block.type === 'text');
      const text = textBlock?.text || '';

      // Set editing state
      setEditingMessageId(messageId);

      // Populate the input with the message text
      setInput(text);

      // Focus the textarea
      setTimeout(() => {
        textareaRef.current?.focus();
        // Move cursor to the end of the text
        const length = text.length;
        textareaRef.current?.setSelectionRange(length, length);
      }, 0);
    },
    [messages]
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
    regenerate,
    editMessage,
    cancelEdit,
    clearChat,
    setInput,
    input,
  };
};
