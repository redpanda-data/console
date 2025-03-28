import { Box } from '@redpanda-data/ui';
import type { ChatMessage } from 'database/chat-db';
import ReactMarkdown from 'react-markdown';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './chat-code-block';

interface ChatMarkdownProps {
  message: ChatMessage;
}

export const ChatMarkdown = ({ message }: ChatMarkdownProps) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkEmoji]}
      components={{
        // Basic text elements
        p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,

        // Headings
        h1: ({ children }) => <h1 className="text-2xl font-bold pt-6 pb-4 first:pt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-xl font-bold pt-5 pb-3 first:pt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-lg font-bold pt-4 pb-2 first:pt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="text-base font-bold pt-3 pb-2 first:pt-0">{children}</h4>,
        h5: ({ children }) => <h5 className="text-sm font-bold pt-2 pb-1 first:pt-0">{children}</h5>,
        h6: ({ children }) => <h6 className="text-xs font-bold pt-2 pb-1 first:pt-0">{children}</h6>,

        // Lists
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

        // Media elements
        img: ({ src, alt }) => <img src={src} alt={alt} className="mb-4 max-w-full h-auto rounded-lg" />,
        audio: ({ src, controls }) => (
          <audio src={src} controls={controls} className="mb-4 w-full">
            <track kind="captions" src="" label="English captions" />
            Your browser does not support the audio element.
          </audio>
        ),

        // Links and text formatting
        a: ({ href, children }) => (
          <a
            href={href}
            className={`${
              message.sender === 'user'
                ? 'text-blue-100 hover:text-white underline'
                : 'text-blue-600 hover:text-blue-800'
            }`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),
        abbr: ({ title, children }) => (
          <abbr title={title} className="cursor-help border-b border-dotted">
            {children}
          </abbr>
        ),
        address: ({ children }) => <address className="mb-4 italic">{children}</address>,
        b: ({ children }) => <b className="font-bold">{children}</b>,
        bdi: ({ children }) => <bdi>{children}</bdi>,
        bdo: ({ dir, children }) => <bdo dir={dir}>{children}</bdo>,
        big: ({ children }) => <span className="text-lg">{children}</span>,
        blockquote: ({ children }) => (
          <blockquote className="pl-4 italic border-l-4 border-gray-300 mb-4 text-gray-600">{children}</blockquote>
        ),
        br: () => <br />,
        cite: ({ children }) => <cite className="italic">{children}</cite>,
        del: ({ children }) => <del className="line-through text-gray-500">{children}</del>,
        em: ({ children }) => <em className="italic">{children}</em>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,

        // Layout elements
        article: ({ children }) => <article className="mb-4">{children}</article>,
        aside: ({ children }) => <aside className="mb-4 p-4 bg-gray-50 rounded">{children}</aside>,
        body: ({ children }) => <div>{children}</div>,
        div: ({ children }) => <div className="mb-4">{children}</div>,
        details: ({ children }) => <details className="mb-4">{children}</details>,
        dialog: ({ children }) => <dialog className="p-4 rounded shadow-lg">{children}</dialog>,
        figcaption: ({ children }) => <figcaption className="text-sm text-gray-500 mt-1">{children}</figcaption>,
        figure: ({ children }) => <figure className="mb-4">{children}</figure>,
        footer: ({ children }) => <footer className="mt-4 pt-4 border-t border-gray-200">{children}</footer>,
        header: ({ children }) => <header className="mb-4 pb-4 border-b border-gray-200">{children}</header>,
        hr: () => <hr className="my-6 border-t border-gray-200" />,

        // Definition lists
        dl: ({ children }) => <dl className="mb-4">{children}</dl>,
        dt: ({ children }) => <dt className="font-bold">{children}</dt>,
        dd: ({ children }) => <dd className="ml-4 mb-2">{children}</dd>,

        // Data elements
        data: ({ value, children }) => (
          <data value={value} className="text-gray-600">
            {children}
          </data>
        ),

        // Form elements (limited markdown support)
        button: ({ children }) => (
          <button
            type="button"
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {children}
          </button>
        ),
        fieldset: ({ children }) => <fieldset className="border border-gray-300 p-4 rounded mb-4">{children}</fieldset>,

        // Code blocks
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className || '');

          if (match) {
            return (
              <Box py={1}>
                <CodeBlock
                  theme="light"
                  language={match?.[1] ?? ''}
                  codeString={String(children).replace(/\n$/, '')}
                  showLineNumbers={false}
                  showCopyButton={false}
                />
              </Box>
            );
          }

          return <code className={className}>{children}</code>;
        },

        // Table elements
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4">
            <table className="min-w-[600px] divide-y divide-gray-200 border border-gray-300">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-gray-200">{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => (
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{children}</th>
        ),
        td: ({ children }) => <td className="px-6 py-4 whitespace-nowrap">{children}</td>,

        // Elements with no visual representation or not commonly used in markdown
        area: () => null,
        base: () => null,
        canvas: () => null,
        col: () => null,
        colgroup: () => null,
        datalist: () => null,
        embed: () => null,
        head: () => null,
        html: ({ children }) => <div>{children}</div>,
      }}
    >
      {message.content}
    </ReactMarkdown>
  );
};
