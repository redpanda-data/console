import type { ChatMessage } from 'database/chat-db';

import { ChatMarkdown } from './chat-markdown';

type ChatMessageViewProps = {
  message: ChatMessage;
};

export const ChatMessageView = ({ message }: ChatMessageViewProps) => (
  <div className={`flex p-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`} key={message.id}>
    <article
      aria-label={`${message.sender} message`}
      className={`max-w-[85%] rounded-xl p-4 shadow-sm ${
        message.sender === 'user' ? 'bg-blue-500 text-white' : 'border border-slate-200 bg-white text-slate-900'
      }`}
    >
      <div className="space-y-4 text-sm leading-relaxed">
        <ChatMarkdown message={message} />
      </div>
      <p className={`mt-2 text-xs ${message.sender === 'user' ? 'text-blue-100' : 'text-slate-500'}`}>
        {message.timestamp.toLocaleTimeString()}
      </p>
    </article>
  </div>
);
