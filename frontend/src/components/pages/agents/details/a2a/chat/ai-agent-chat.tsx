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

'use client';

import { Conversation, ConversationContent, ConversationEmptyState } from 'components/ai-elements/conversation';
import { Loader } from 'components/ai-elements/loader';
import { useCallback, useEffect, useRef } from 'react';

import { ChatInput } from './components/chat-input';
import { ChatMessage } from './components/chat-message';
import { useChatActions } from './hooks/use-chat-actions';
import { useChatMessages } from './hooks/use-chat-messages';
import { useCumulativeUsage } from './hooks/use-cumulative-usage';
import type { AIAgentChatProps } from './types';

export const AIAgentChat = ({ agent }: AIAgentChatProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Manage chat messages and context
  const { messages, setMessages, contextId, setContextSeed, isLoadingHistory } = useChatMessages(agent.id);

  // Manage chat actions (submit, clear, cancel)
  // Pass agent.url directly so the A2A client can try multiple agent card URLs
  const { isLoading, editingMessageId, handleSubmit, cancelEdit, clearChat, handleCancelTask, setInput, input } =
    useChatActions({
      agentId: agent.id,
      agentCardUrl: agent.url,
      model: agent.model,
      contextId,
      messages,
      setMessages,
      setContextSeed,
    });

  // Stable callback references to prevent ChatInput re-renders
  const handleCancel = useCallback(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage?.taskId) {
      void handleCancelTask(lastMessage.taskId);
    }
  }, [messages, handleCancelTask]);

  const handleSubmitMessage = useCallback(
    (message: Parameters<typeof handleSubmit>[0], event: React.FormEvent) => {
      event.preventDefault();
      void handleSubmit(message);
    },
    [handleSubmit]
  );

  // Focus textarea when container becomes visible (tab switch)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            textareaRef.current?.focus();
          });
        }
      },
      { threshold: 0.1 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Calculate cumulative token usage from messages
  const latestUsage = useCumulativeUsage(messages);

  return (
    <div className="flex h-[calc(100vh-175px)] flex-col" ref={containerRef}>
      {/* Context ID header */}
      {contextId && (
        <div className="shrink-0 border-b bg-muted/30 px-4 py-2">
          <div className="flex gap-1.5 text-muted-foreground text-xs">
            <span className="font-medium">context_id:</span>
            <span className="font-mono">{contextId}</span>
          </div>
        </div>
      )}

      <Conversation className="flex-1" initial="instant" resize="instant">
        <ConversationContent>
          {isLoadingHistory && (
            <div className="flex h-full items-center justify-center">
              <Loader size={24} />
            </div>
          )}

          {!isLoadingHistory && messages.length === 0 && <ConversationEmptyState title="No messages yet" />}

          {!isLoadingHistory &&
            messages.length > 0 &&
            messages.map((message, index) => {
              // Only show loading indicator on the last assistant message to avoid duplicates
              const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;

              return (
                <div key={message.id}>
                  <ChatMessage isLoading={isLoading && isLastAssistant} message={message} />
                </div>
              );
            })}
        </ConversationContent>
      </Conversation>

      <ChatInput
        agent={agent}
        editingMessageId={editingMessageId}
        hasMessages={messages.length > 0}
        input={input}
        isLoading={isLoading}
        onCancel={handleCancel}
        onCancelEdit={cancelEdit}
        onClearHistory={clearChat}
        onInputChange={setInput}
        onSubmit={handleSubmitMessage}
        textareaRef={textareaRef}
        usage={latestUsage}
      />
    </div>
  );
};
