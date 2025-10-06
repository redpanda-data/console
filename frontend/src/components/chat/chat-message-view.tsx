import type { ChatMessage } from 'database/chat-db';

import { ChatMarkdown } from './chat-markdown';

interface ChatMessageViewProps {
  message: ChatMessage;
}

export const ChatMessageView = ({ message }: ChatMessageViewProps) => {
  return (
    <div className={`flex p-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`} key={message.id}>
      <div
        aria-label={`${message.sender} message`}
        className={`p-4 rounded-xl max-w-[85%] shadow-sm ${
          message.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-slate-900 border border-slate-200'
        }`}
        role="article"
      >
        <div className="text-sm leading-relaxed space-y-4">
          <ChatMarkdown message={message} />
        </div>
        <p className={`text-xs mt-2 ${message.sender === 'user' ? 'text-blue-100' : 'text-slate-500'}`}>
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};
