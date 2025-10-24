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

import { Conversation, ConversationContent, ConversationScrollButton } from 'components/ai-elements/conversation';
import { Loader } from 'components/ai-elements/loader';
import { useMemo, useRef } from 'react';
import { getAgentCardUrl } from 'utils/ai-agent.utils';

import { ChatEmptyState } from './components/chat-empty-state';
import { ChatInput } from './components/chat-input';
import { ChatMessage } from './components/chat-message';
import { useChatActions } from './hooks/use-chat-actions';
import { useChatMessages } from './hooks/use-chat-messages';
import type { AIAgentChatProps } from './types';

export const AIAgentChat = ({ agent }: AIAgentChatProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get the agent card URL for the a2a provider
  const agentCardUrl = useMemo(() => getAgentCardUrl({ agentUrl: agent.url }), [agent.url]);

  // Manage chat messages and context
  const { messages, setMessages, contextId, setContextSeed, isLoadingHistory } = useChatMessages(agent.id);

  // Manage chat actions (submit, regenerate, edit, clear)
  const { isLoading, editingMessageId, handleSubmit, regenerate, editMessage, cancelEdit, clearChat, setInput, input } =
    useChatActions({
      agentId: agent.id,
      agentCardUrl,
      model: agent.model,
      contextId,
      messages,
      setMessages,
      setContextSeed,
    });

  return (
    <div className="flex h-full w-full flex-col">
      <Conversation className="flex-1">
        <ConversationContent>
          {isLoadingHistory && (
            <div className="flex h-full items-center justify-center">
              <Loader size={24} />
            </div>
          )}

          {!isLoadingHistory && messages.length === 0 && <ChatEmptyState />}

          {!isLoadingHistory &&
            messages.length > 0 &&
            messages.map((message, messageIndex) => {
              const isLastMessage = messageIndex === messages.length - 1;

              return (
                <ChatMessage
                  isLastMessage={isLastMessage}
                  isLoading={isLoading}
                  key={message.id}
                  message={message}
                  onEdit={() => editMessage(message.id, textareaRef)}
                  onRetry={regenerate}
                />
              );
            })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <ChatInput
        editingMessageId={editingMessageId}
        input={input}
        isLoading={isLoading}
        model={agent.model}
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
