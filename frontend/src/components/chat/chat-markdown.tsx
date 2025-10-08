import { Box } from '@redpanda-data/ui';
import type { ChatMessage } from 'database/chat-db';
import ReactMarkdown from 'react-markdown';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';

import { ChatCodeBlock } from './chat-code-block';

const LANGUAGE_CLASS_REGEX = /language-(\w+)/;
const TRAILING_NEWLINE_REGEX = /\n$/;

type ChatMarkdownProps = {
  message: ChatMessage;
};

export const ChatMarkdown = ({ message }: ChatMarkdownProps) => {
  return (
    <ReactMarkdown
      components={{
        // Basic text elements
        p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,

        // Headings
        h1: ({ children }) => <h1 className="pt-6 pb-4 font-bold text-2xl first:pt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="pt-5 pb-3 font-bold text-xl first:pt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="pt-4 pb-2 font-bold text-lg first:pt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="pt-3 pb-2 font-bold text-base first:pt-0">{children}</h4>,
        h5: ({ children }) => <h5 className="pt-2 pb-1 font-bold text-sm first:pt-0">{children}</h5>,
        h6: ({ children }) => <h6 className="pt-2 pb-1 font-bold text-xs first:pt-0">{children}</h6>,

        // Lists
        ul: ({ children }) => (
          <ul className="mb-4 list-disc space-y-1" style={{ marginLeft: '2rem' }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 list-decimal space-y-1" style={{ marginLeft: '2rem' }}>
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="mb-1">{children}</li>,

        // Media elements
        img: ({ src, alt }) => <img alt={alt} className="mb-4 h-auto max-w-full rounded-lg" src={src} />,
        audio: ({ src, controls }) => (
          <audio className="mb-4 w-full" controls={controls} src={src}>
            <track kind="captions" label="English captions" src="" />
            Your browser does not support the audio element.
          </audio>
        ),

        // Links and text formatting
        a: ({ href, children }) => (
          <a
            className={`${
              message.sender === 'user'
                ? 'text-blue-100 underline hover:text-white'
                : 'text-blue-600 hover:text-blue-800'
            }`}
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        abbr: ({ title, children }) => (
          <abbr className="cursor-help border-b border-dotted" title={title}>
            {children}
          </abbr>
        ),
        address: ({ children }) => <address className="mb-4 italic">{children}</address>,
        b: ({ children }) => <b className="font-bold">{children}</b>,
        bdi: ({ children }) => <bdi>{children}</bdi>,
        bdo: ({ dir, children }) => <bdo dir={dir}>{children}</bdo>,
        big: ({ children }) => <span className="text-lg">{children}</span>,
        blockquote: ({ children }) => (
          <blockquote className="mb-4 border-gray-300 border-l-4 pl-4 text-gray-600 italic">{children}</blockquote>
        ),
        br: () => <br />,
        cite: ({ children }) => <cite className="italic">{children}</cite>,
        del: ({ children }) => <del className="text-gray-500 line-through">{children}</del>,
        em: ({ children }) => <em className="italic">{children}</em>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,

        // Layout elements
        article: ({ children }) => <article className="mb-4">{children}</article>,
        aside: ({ children }) => <aside className="mb-4 rounded bg-gray-50 p-4">{children}</aside>,
        body: ({ children }) => <div>{children}</div>,
        div: ({ children }) => <div className="mb-4">{children}</div>,
        details: ({ children }) => <details className="mb-4">{children}</details>,
        dialog: ({ children }) => <dialog className="rounded p-4 shadow-lg">{children}</dialog>,
        figcaption: ({ children }) => <figcaption className="mt-1 text-gray-500 text-sm">{children}</figcaption>,
        figure: ({ children }) => <figure className="mb-4">{children}</figure>,
        footer: ({ children }) => <footer className="mt-4 border-gray-200 border-t pt-4">{children}</footer>,
        header: ({ children }) => <header className="mb-4 border-gray-200 border-b pb-4">{children}</header>,
        hr: () => <hr className="my-6 border-gray-200 border-t" />,

        // Definition lists
        dl: ({ children }) => <dl className="mb-4">{children}</dl>,
        dt: ({ children }) => <dt className="font-bold">{children}</dt>,
        dd: ({ children }) => <dd className="mb-2 ml-4">{children}</dd>,

        // Data elements
        data: ({ value, children }) => (
          <data className="text-gray-600" value={value}>
            {children}
          </data>
        ),

        // Form elements (limited markdown support)
        button: ({ children }) => (
          <button
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
            type="button"
          >
            {children}
          </button>
        ),
        fieldset: ({ children }) => <fieldset className="mb-4 rounded border border-gray-300 p-4">{children}</fieldset>,

        // Code blocks
        code({ className, children }) {
          const match = LANGUAGE_CLASS_REGEX.exec(className || '');

          if (match) {
            return (
              <Box py={1}>
                <ChatCodeBlock
                  codeString={String(children).replace(TRAILING_NEWLINE_REGEX, '')}
                  language={match?.[1] ?? ''}
                  showCopyButton
                  showLineNumbers={false}
                  theme="light"
                />
              </Box>
            );
          }

          return <code className={className}>{children}</code>;
        },

        // Table elements
        table: ({ children }) => (
          <div className="mb-4 overflow-x-auto">
            <table className="min-w-[600px] divide-y divide-gray-200 border border-gray-300">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-gray-200">{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => (
          <th className="px-6 py-3 text-left font-medium text-gray-500 text-xs uppercase tracking-wider">{children}</th>
        ),
        td: ({ children }) => <td className="whitespace-nowrap px-6 py-4">{children}</td>,

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
      remarkPlugins={[remarkGfm, remarkEmoji]}
    >
      {message.content}
    </ReactMarkdown>
  );
};
