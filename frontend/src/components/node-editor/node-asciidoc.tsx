'use client';

import { useEffect, useRef } from 'react';

interface NodeAsciidocProps {
  content: string;
}

export const NodeAsciidoc = ({ content }: NodeAsciidocProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically import asciidoctor to avoid SSR issues
    const loadAsciidoctor = async () => {
      try {
        const Asciidoctor = (await import('asciidoctor')).default;
        const asciidoctor = Asciidoctor();

        const html = asciidoctor.convert(content, {
          safe: 'unsafe',
          attributes: {
            'source-highlighter': 'highlight.js',
            stylesheet: null, // Disable default stylesheet to use our own styling
          },
        });

        if (containerRef.current) {
          containerRef.current.innerHTML = html as string;
        }
      } catch (error) {
        console.error('Failed to load Asciidoctor:', error);
        // Fallback to plain text if Asciidoctor fails
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre>${content}</pre>`;
        }
      }
    };

    loadAsciidoctor();
  }, [content]);

  return (
    <div
      ref={containerRef}
      className="asciidoc-content prose prose-sm w-full max-w-full overflow-x-auto dark:prose-invert
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:pt-6 [&_h1]:pb-4 [&_h1]:first:pt-0
        [&_h2]:text-xl [&_h2]:font-bold [&_h2]:pt-5 [&_h2]:pb-3 [&_h2]:first:pt-0
        [&_h3]:text-lg [&_h3]:font-bold [&_h3]:pt-4 [&_h3]:pb-2 [&_h3]:first:pt-0
        [&_h4]:text-base [&_h4]:font-bold [&_h4]:pt-3 [&_h4]:pb-2 [&_h4]:first:pt-0
        [&_h5]:text-sm [&_h5]:font-bold [&_h5]:pt-2 [&_h5]:pb-1 [&_h5]:first:pt-0
        [&_h6]:text-xs [&_h6]:font-bold [&_h6]:pt-2 [&_h6]:pb-1 [&_h6]:first:pt-0
        [&_p]:mb-4 [&_p]:last:mb-0 [&_p]:break-words
        [&_ul]:list-disc [&_ul]:mb-4 [&_ul]:space-y-1 [&_ul]:ml-8
        [&_ol]:list-decimal [&_ol]:mb-4 [&_ol]:space-y-1 [&_ol]:ml-8
        [&_li]:mb-1 [&_li]:break-words
        [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:mb-4 [&_blockquote]:text-gray-600 [&_blockquote]:break-words
        [&_code]:px-1 [&_code]:py-0.5 [&_code]:bg-muted [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:break-all
        [&_pre]:p-4 [&_pre]:bg-muted [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-4 [&_pre]:max-w-full
        [&_table]:w-full [&_table]:table-auto [&_table]:divide-y [&_table]:divide-gray-200 [&_table]:border [&_table]:border-gray-300 [&_table]:mb-4 [&_table]:overflow-x-auto [&_table]:block [&_table]:whitespace-nowrap
        [&_thead]:bg-gray-50 [&_thead]:table-header-group
        [&_tbody]:table-row-group
        [&_tr]:table-row
        [&_th]:px-6 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-gray-500 [&_th]:uppercase [&_th]:tracking-wider [&_th]:table-cell
        [&_td]:px-6 [&_td]:py-4 [&_td]:break-words [&_td]:table-cell [&_td]:max-w-0
        [&_a]:text-blue-600 [&_a]:hover:text-blue-800 [&_a]:break-words
        [&_img]:mb-4 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg
        [&_hr]:my-6 [&_hr]:border-t [&_hr]:border-gray-200
        [&_.admonitionblock]:p-4 [&_.admonitionblock]:mb-4 [&_.admonitionblock]:rounded [&_.admonitionblock]:border-l-4 [&_.admonitionblock]:break-words
        [&_.admonitionblock.note]:bg-blue-50 [&_.admonitionblock.note]:border-blue-400
        [&_.admonitionblock.tip]:bg-green-50 [&_.admonitionblock.tip]:border-green-400
        [&_.admonitionblock.important]:bg-yellow-50 [&_.admonitionblock.important]:border-yellow-400
        [&_.admonitionblock.caution]:bg-orange-50 [&_.admonitionblock.caution]:border-orange-400
        [&_.admonitionblock.warning]:bg-red-50 [&_.admonitionblock.warning]:border-red-400"
    />
  );
};
