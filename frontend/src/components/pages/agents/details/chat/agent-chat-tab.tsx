import { chatDb } from 'database/chat-db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect, useRef, useState } from 'react';
import { ChatClearButton } from './chat-clear-button';
import { ChatInput } from './chat-input';
import { ChatLoadingIndicator } from './chat-loading-indicator';
import { ChatMessageContainer } from './chat-message-container';
import { Alert, AlertIcon } from '@redpanda-data/ui';

interface AgentChatTabProps {
  agent?: Pipeline;
}

/**
 * This component is using Dexie to listen for message changes in the database.
 * It is also using Tailwind CSS under the hood for styling instead of Chakra UI.
 * Each agent has its own separate conversation history.
 * @see https://github.com/dexie/Dexie.js
 */
export const AgentChatTab = ({ agent }: AgentChatTabProps) => {
  const [isTyping, setIsTyping] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const id = agent?.id ?? null;

  // Update scroll position when shouldScroll changes
  useEffect(() => {
    if (shouldScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShouldScroll(false);
    }
  }, [shouldScroll]);

  // Use live query to listen for message changes in the database
  const messages =
    useLiveQuery(async () => {
      if (!id) return [];
      const storedMessages = await chatDb.getAllMessages(id);
      setShouldScroll(true);
      return storedMessages;
    }, [id]) || [];

  const handleClearChat = async () => {
    try {
      if (!id) return;
      await chatDb.clearAllMessages(id);
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  };

  if (!messages) {
    return <ChatLoadingIndicator />;
  }

  if (!id || !agent?.url) {
    return (
      <div className="p-4">
        <Alert status="error" variant="subtle">
          <AlertIcon />
          Chat is not available right now.
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full px-4 max-w-screen-xl mx-auto">
      <h2 className="text-2xl pt-4 font-bold text-gray-900 mb-">Test your AI agent</h2>
      <div className="flex flex-col min-h-0">
        <ChatClearButton onClear={handleClearChat} />
        <ChatMessageContainer messages={messages} isTyping={isTyping} messagesEndRef={messagesEndRef} />
      </div>
      <ChatInput setIsTyping={setIsTyping} agentUrl={agent?.url} agentId={id} />
    </div>
  );
};
