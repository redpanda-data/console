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

import { ConnectError } from '@connectrpc/connect';
import { ChatClearButton } from 'components/chat/chat-clear-button';
import { ChatLoadingIndicator } from 'components/chat/chat-loading-indicator';
import { ChatTypingIndicator } from 'components/chat/chat-typing-indicator';
import { chatDb } from 'database/chat-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { AIAgentChatInput, type AIAgentChatInputRef } from './ai-agent-chat-input';
import { AIAgentMessageView } from './ai-agent-message-view';

type AIAgentChatProps = {
  agentUrl: string;
  agentId: string;
};

/**
 * AI Agent Chat component using Dexie for message storage and A2A protocol for communication.
 * Each AI agent has its own separate chat conversation history.
 */
export const AIAgentChat = ({ agentUrl, agentId }: AIAgentChatProps) => {
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<AIAgentChatInputRef>(null);

  // Use live query to listen for message changes in the database
  const messages =
    useLiveQuery(async () => {
      if (!agentId) {
        return [];
      }
      setIsLoadingMessages(true);
      const storedMessages = await chatDb.getAllMessages(agentId);
      setIsLoadingMessages(false);
      return storedMessages;
    }, [agentId]) || [];

  // Reset initial load flag when agent changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: We want to reset on agentId change
  useEffect(() => {
    setIsInitialLoad(true);
  }, [agentId]);

  // Only auto-scroll on initial load
  useEffect(() => {
    if (isInitialLoad && messages.length > 0 && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
      setIsInitialLoad(false);
    }
  }, [isInitialLoad, messages.length]);

  const handleClearChat = async () => {
    try {
      if (!agentId) {
        return;
      }
      await chatDb.clearAllMessages(agentId);
      // Reset the context ID to start a fresh conversation
      chatInputRef.current?.resetContext();
    } catch (error) {
      const connectError = ConnectError.from(error);

      toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'clear', entity: 'chat messages' }));
    }
  };

  if (!messages) {
    return <ChatLoadingIndicator />;
  }

  return (
    <div className="mx-auto flex w-full flex-col px-4">
      <div className="flex min-h-0 flex-col">
        {messages?.length > 0 && <ChatClearButton onClear={handleClearChat} />}
        {!isLoadingMessages && (
          <div aria-label="Chat messages" className="mb-4" role="log">
            <div className="flex flex-col space-y-4">
              {messages.map((message) => (
                <AIAgentMessageView isStreaming={message.isStreaming} key={message.id} message={message} />
              ))}

              {isTyping && <ChatTypingIndicator text="Agent is typing..." />}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>
      <AIAgentChatInput
        agentId={agentId}
        agentUrl={agentUrl}
        messagesEndRef={messagesEndRef}
        ref={chatInputRef}
        setIsTyping={setIsTyping}
      />
    </div>
  );
};
