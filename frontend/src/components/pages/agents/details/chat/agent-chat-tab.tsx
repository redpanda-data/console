import { proto3 } from '@bufbuild/protobuf';
import { Alert, AlertIcon, Spinner } from '@redpanda-data/ui';
import { chatDb } from 'database/chat-db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect, useRef, useState } from 'react';
import { ChatClearButton } from './chat-clear-button';
import { ChatInput } from './chat-input';
import { ChatLoadingIndicator } from './chat-loading-indicator';
import { ChatMessageContainer } from './chat-message-container';

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
        {agent?.state === Pipeline_State.STARTING ? (
          <div className="flex items-center">
            <Spinner size="sm" mr={2} />
            The pipeline is starting. Chat is not available right now.
          </div>
        ) : (
          <Alert status="warning">
            <AlertIcon />
            Chat is not available right now. Pipeline is in state:{' '}
            {proto3.getEnumType(Pipeline_State).findNumber(agent?.state ?? Pipeline_State.UNSPECIFIED)?.name}
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full px-4 max-w-screen-xl mx-auto">
      <div className="flex flex-col min-h-0">
        <ChatClearButton onClear={handleClearChat} />
        <ChatMessageContainer messages={messages} isTyping={isTyping} messagesEndRef={messagesEndRef} />
      </div>
      <ChatInput setIsTyping={setIsTyping} agentUrl={agent?.url} agentId={id} />
    </div>
  );
};
