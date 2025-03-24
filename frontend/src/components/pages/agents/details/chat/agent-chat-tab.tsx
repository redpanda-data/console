import { chatDb } from 'database/chat-db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect, useRef, useState } from 'react';
import { ChatClearButton } from './chat-clear-button';
import { ChatInput } from './chat-input';
import { ChatLoadingIndicator } from './chat-loading-indicator';
import { ChatMessageContainer } from './chat-message-container';

interface AgentChatTabProps {
  id: string;
  agent?: Pipeline;
}

/**
 * This component is using Dexie to listen for message changes in the database.
 * It is also using Tailwind CSS under the hood for styling instead of Chakra UI.
 * Each agent has its own separate conversation history.
 * @see https://github.com/dexie/Dexie.js
 */
export const AgentChatTab = ({ id, agent }: AgentChatTabProps) => {
  const [isTyping, setIsTyping] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      const storedMessages = await chatDb.getAllMessages(id);
      setShouldScroll(true);
      return storedMessages;
    }, [id]) || [];

  const handleClearChat = async () => {
    try {
      await chatDb.clearAllMessages(id);
    } catch (error) {
      console.error('Error clearing messages:', error);
    }
  };

  if (!messages) {
    return <ChatLoadingIndicator />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] w-full px-4">
      <div className="flex-1 flex flex-col min-h-0">
        <ChatClearButton onClear={handleClearChat} />
        <ChatMessageContainer messages={messages} isTyping={isTyping} messagesEndRef={messagesEndRef} />
      </div>
      <div className="flex-shrink-0 sticky bottom-0 bg-white">
        <ChatInput setIsTyping={setIsTyping} agentUrl={agent?.url} agentId={id} />
      </div>
    </div>
  );
};
