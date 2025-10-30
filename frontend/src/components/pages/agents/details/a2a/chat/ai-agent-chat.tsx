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
import { motion } from 'framer-motion';
import { useChatScroll } from 'hooks/use-chat-scroll';
import { useMemo, useRef } from 'react';
import { getAgentCardUrl } from 'utils/ai-agent.utils';

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

  // Manage chat actions (submit, clear)
  const { isLoading, editingMessageId, handleSubmit, cancelEdit, clearChat, setInput, input } = useChatActions({
    agentId: agent.id,
    agentCardUrl,
    model: agent.model,
    contextId,
    messages,
    setMessages,
    setContextSeed,
  });

  // Manage scroll behavior
  const { endRef, autoScrollPaused, setAutoScrollPaused, onViewportEnter, onViewportLeave } = useChatScroll({
    agentId: agent.id,
    isLoading,
    isStreaming: isLoading, // Use isLoading as streaming indicator
    messages,
  });

  return (
    <div className="flex h-full w-full flex-col">
      <Conversation className="relative flex flex-1 flex-col">
        <ConversationContent>
          {isLoadingHistory && (
            <div className="flex h-full items-center justify-center">
              <Loader size={24} />
            </div>
          )}

          {!isLoadingHistory && messages.length === 0 && <ConversationEmptyState />}

          {!isLoadingHistory &&
            messages.length > 0 &&
            messages.map((message, index) => {
              // Only show loading indicator on the last assistant message to avoid duplicates
              const isLastAssistant = message.role === 'assistant' && index === messages.length - 1;

              return <ChatMessage isLoading={isLoading && isLastAssistant} key={message.id} message={message} />;
            })}

          {/* Invisible anchor element at bottom with viewport detection */}
          <motion.div
            className="min-h-[24px] min-w-[24px] shrink-0"
            onViewportEnter={onViewportEnter}
            onViewportLeave={onViewportLeave}
            ref={endRef}
          />
        </ConversationContent>
      </Conversation>

      <ChatInput
        autoScrollEnabled={!autoScrollPaused}
        editingMessageId={editingMessageId}
        hasMessages={messages.length > 0}
        input={input}
        isLoading={isLoading}
        model={agent.model}
        onAutoScrollChange={(enabled) => setAutoScrollPaused(!enabled)}
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
