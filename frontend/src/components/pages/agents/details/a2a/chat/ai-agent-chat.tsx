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
import { useRef } from 'react';

import { ChatInput } from './components/chat-input';
import { ChatMessage } from './components/chat-message';
import { useChatActions } from './hooks/use-chat-actions';
import { useChatMessages } from './hooks/use-chat-messages';
import type { AIAgentChatProps } from './types';

export const AIAgentChat = ({ agent }: AIAgentChatProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className="flex h-[calc(100vh-255px)] flex-col">
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
        editingMessageId={editingMessageId}
        hasMessages={messages.length > 0}
        input={input}
        isLoading={isLoading}
        model={agent.model}
        onCancel={() => {
          const lastMessage = messages.at(-1);
          if (lastMessage?.taskId) {
            void handleCancelTask(lastMessage.taskId);
          }
        }}
        onCancelEdit={cancelEdit}
        onClearHistory={clearChat}
        onInputChange={setInput}
        onSubmit={(message, event) => {
          event.preventDefault();
          void handleSubmit(message);
        }}
        textareaRef={textareaRef}
      />
    </div>
  );
};
