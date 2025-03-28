import type { ChatMessage } from 'database/chat-db';
import { AgentChatBlankState } from './agent-chat-blank-state';
import { ChatMessageView } from './chat-message-view';
import { ChatTypingIndicator } from './chat-typing-indicator';

interface ChatMessageContainerProps {
  messages: ChatMessage[];
  isTyping: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onSelectQuestion?: (question: string) => void;
}

export const ChatMessageContainer = ({
  messages,
  isTyping,
  messagesEndRef,
  onSelectQuestion,
}: ChatMessageContainerProps) => {
  if (messages.length === 0) {
    return <AgentChatBlankState onSelectQuestion={onSelectQuestion} />;
  }

  return (
    <div
      className="overflow-y-auto max-h-[calc(50vh)] rounded-md mb-4 border bg-slate-50"
      aria-label="Chat messages"
      role="log"
    >
      <div className="flex flex-col space-y-4">
        {messages.map((message: ChatMessage) => (
          <ChatMessageView key={message.id} message={message} />
        ))}

        {isTyping && <ChatTypingIndicator text="Agent is typing..." />}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
