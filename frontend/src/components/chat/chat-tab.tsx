import { Spinner } from '@redpanda-data/ui';
import { chatDb } from 'database/chat-db';
import { useLiveQuery } from 'dexie-react-hooks';
import { type Pipeline, Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect, useRef, useState } from 'react';

import { ChatBlankState } from './chat-blank-state';
import { ChatClearButton } from './chat-clear-button';
import { ChatInput } from './chat-input';
import { ChatLoadingIndicator } from './chat-loading-indicator';
import { ChatMessageContainer } from './chat-message-container';
import { ChatNotification } from './chat-notification';

type ChatTabProps = {
  pipeline?: Pipeline;
};

/**
 * This component is using Dexie to listen for message changes in the database.
 * It is also using Tailwind CSS under the hood for styling instead of Chakra UI.
 * Each agent has its own separate chat conversation history.
 * @see https://github.com/dexie/Dexie.js
 */
export const ChatTab = ({ pipeline }: ChatTabProps) => {
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
      if (!id) {
        return [];
      }
      setIsLoadingMessages(true);
      const storedMessages = await chatDb.getAllMessages(id);
      setShouldScroll(true);
      setIsLoadingMessages(false);
      return storedMessages;
    }, [id]) || [];

  const handleClearChat = async () => {
    try {
      if (!id) {
        return;
      }
      await chatDb.clearAllMessages(id);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: error logging for debugging clear failures
      console.error('Error clearing messages:', error);
    }
  };

  if (!(id && pipeline?.url) || pipeline?.state === Pipeline_State.STARTING) {
    return (
      <ChatNotification
        notification={
          <>
            <Spinner mr={2} size="sm" />
            <span>Chat is not available right now.</span>
          </>
        }
      />
    );
  }

  if (!messages) {
    return <ChatLoadingIndicator />;
  }

  return (
    <div className="mx-auto flex w-full max-w-screen-xl flex-col px-4">
      <div className="flex min-h-0 flex-col">
        {messages?.length > 0 && <ChatClearButton onClear={handleClearChat} />}
        {!isLoadingMessages && (
          <ChatMessageContainer isTyping={isTyping} messages={messages} messagesEndRef={messagesEndRef} />
        )}
      </div>
      <ChatInput
        agentId={id}
        agentUrl={pipeline?.url}
        initialValue={selectedQuestion ?? undefined}
        messagesEndRef={messagesEndRef}
        onInputChange={() => setSelectedQuestion(null)}
        setIsTyping={setIsTyping}
      />
      {messages?.length === 0 && <ChatBlankState onSelectQuestion={handleSelectQuestion} />}
    </div>
  );
};
