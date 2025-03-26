import type { ChatMessage } from 'database/chat-db';
import ReactMarkdown from 'react-markdown';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';

interface ChatMessageViewProps {
  message: ChatMessage;
}

export const ChatMessageView = ({ message }: ChatMessageViewProps) => {
  return (
    <div key={message.id} className={`flex p-4 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`p-4 rounded-xl max-w-[85%] shadow-sm ${
          message.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white text-slate-900 border border-slate-200'
        }`}
        role="article"
        aria-label={`${message.sender} message`}
      >
        <div className="text-sm leading-relaxed space-y-4">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkEmoji]}
            components={{
              p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
              ul: ({ children }) => (
                <ul className="list-disc mb-4 space-y-1" style={{ marginLeft: '2rem' }}>
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal mb-4 space-y-1" style={{ marginLeft: '2rem' }}>
                  {children}
                </ol>
              ),
              li: ({ children }) => <li className="mb-1">{children}</li>,
              h1: ({ children }) => <h1 className="text-2xl font-bold pt-6 pb-4 first:pt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-xl font-bold pt-5 pb-3 first:pt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="text-lg font-bold pt-4 pb-2 first:pt-0">{children}</h3>,
              a: ({ href, children }) => (
                <a
                  href={href}
                  className={`${
                    message.sender === 'user'
                      ? 'text-blue-100 hover:text-white underline'
                      : 'text-blue-600 hover:text-blue-800'
                  }`}
                >
                  {children}
                </a>
              ),
              code: ({ inline, children }) =>
                inline ? (
                  <code
                    className={`px-1.5 py-0.5 rounded ${
                      message.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    {children}
                  </code>
                ) : (
                  <pre
                    className={`rounded-lg p-4 mb-4 overflow-x-auto ${
                      message.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'
                    }`}
                  >
                    <code>{children}</code>
                  </pre>
                ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        <p className={`text-xs mt-2 ${message.sender === 'user' ? 'text-blue-100' : 'text-slate-500'}`}>
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};
