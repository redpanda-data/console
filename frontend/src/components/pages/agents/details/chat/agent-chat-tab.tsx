import { Spinner } from '@redpanda-data/ui';
import { chatDb } from 'database/chat-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect, useRef, useState } from 'react';
import { AgentStateDisplayValue } from '../agent-state-display-value';
import { AgentChatBlankState } from './agent-chat-blank-state';
import { AgentChatNotification } from './agent-chat-notification';
import { ChatClearButton } from './chat-clear-button';
import { ChatInput } from './chat-input';
import { ChatLoadingIndicator } from './chat-loading-indicator';
import { ChatMessageContainer } from './chat-message-container';

interface AgentChatTabProps {
  pipeline?: Pipeline;
}

/**
 * This component is using Dexie to listen for message changes in the database.
 * It is also using Tailwind CSS under the hood for styling instead of Chakra UI.
 * Each agent has its own separate chat conversation history.
 * @see https://github.com/dexie/Dexie.js
 */
export const AgentChatTab = ({ pipeline }: AgentChatTabProps) => {
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const id = pipeline?.id ?? null;

  // Update scroll position when shouldScroll changes
  useEffect(() => {
    if (shouldScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShouldScroll(false);
    }
  }, [shouldScroll]);

  // Handle selection of a question
  const handleSelectQuestion = (question: string) => {
    setSelectedQuestion(question);
  };

  // Use live query to listen for message changes in the database
  const messages =
    useLiveQuery(async () => {
      if (!id) return [];
      setIsLoadingMessages(true);
      const storedMessages = await chatDb.getAllMessages(id);
      setShouldScroll(true);
      setIsLoadingMessages(false);
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

  if (!id || !pipeline?.url || pipeline?.state === Pipeline_State.STARTING) {
    return (
      <AgentChatNotification
        notification={
          <>
            <Spinner size="sm" mr={2} />
            <span>Chat is not available right now. Pipeline state: </span>
            <AgentStateDisplayValue state={pipeline?.state} />
          </>
        }
      />
    );
  }

  if (!messages) {
    return <ChatLoadingIndicator />;
  }

  return (
    <div className="flex flex-col w-full px-4 max-w-screen-xl mx-auto">
      <div className="flex flex-col min-h-0">
        {messages?.length > 0 && <ChatClearButton onClear={handleClearChat} />}
        {!isLoadingMessages && (
          <ChatMessageContainer messages={messages} isTyping={isTyping} messagesEndRef={messagesEndRef} />
        )}
      </div>
      <ChatInput
        setIsTyping={setIsTyping}
        agentUrl={pipeline?.url}
        agentId={id}
        initialValue={selectedQuestion ?? undefined}
        onInputChange={() => setSelectedQuestion(null)}
        messagesEndRef={messagesEndRef}
      />
      {messages?.length === 0 && <AgentChatBlankState onSelectQuestion={handleSelectQuestion} />}
    </div>
  );
};
