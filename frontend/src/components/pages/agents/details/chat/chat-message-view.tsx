import type { ChatMessage } from 'database/chat-db';

interface ChatMessageViewProps {
  message: ChatMessage;
}

export const ChatMessageView = ({ message }: ChatMessageViewProps) => {
  return (
    <div key={message.id} className={`flex p-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`p-3 rounded-lg max-w-[80%] ${
          message.sender === 'user' ? 'bg-blue-100 text-blue-900' : 'bg-white text-slate-900 border border-slate-200'
        }`}
        role="article"
        aria-label={`${message.sender} message`}
      >
        <p className="text-sm">{message.content}</p>
        <p className="text-xs text-slate-500 mt-1">{message.timestamp.toLocaleTimeString()}</p>
      </div>
    </div>
  );
};
