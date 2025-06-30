import type { ChatMessage } from 'database/chat-db';
import { ChatMessageView } from './chat-message-view';
import { ChatTypingIndicator } from './chat-typing-indicator';

interface ChatMessageContainerProps {
  messages: ChatMessage[];
  isTyping: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessageContainer = ({ messages, isTyping, messagesEndRef }: ChatMessageContainerProps) => {
  return (
    <div className="mb-4" aria-label="Chat messages" role="log">
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
