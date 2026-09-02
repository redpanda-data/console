/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Link } from 'components/redpanda-ui/components/typography';
import { BookOpenIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';

import type { RawFieldSpec } from '../types/schema';
import { asciidocToMarkdown, markdownToPlainText } from '../utils/asciidoc';

const CLAMP_OVER_CHARS = 200;

// Field prose sits under its control: headings get no more weight than the body.
const MarkdownHeading = ({ children }: { children?: React.ReactNode }) => (
  <div className="mt-1 font-medium text-body-sm text-foreground">{children}</div>
);

const MARKDOWN_COMPONENTS: Components = {
  h1: MarkdownHeading,
  h2: MarkdownHeading,
  h3: MarkdownHeading,
  h4: MarkdownHeading,
  h5: MarkdownHeading,
  h6: MarkdownHeading,
  p: ({ children }) => <div className="text-body-sm text-muted-foreground">{children}</div>,
  a: ({ href, children }) => (
    <Link className="text-body-sm" href={href} rel="noopener noreferrer" target="_blank">
      {children}
    </Link>
  ),
  code: ({ children }) => (
    // break-words, not break-all: only unbreakable strings (DSNs, URLs) wrap mid-token.
    <code className="break-words rounded bg-muted px-1 py-0.5 font-mono text-body-sm text-foreground">{children}</code>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-0.5 pl-4 text-body-sm text-muted-foreground">{children}</ul>,
  ol: ({ children }) => (
    <ol className="list-decimal space-y-0.5 pl-4 text-body-sm text-muted-foreground">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-medium text-foreground">{children}</strong>,
};

// Paragraphs unwrapped, so a one-paragraph description can flow inline with its trailing docs link.
const INLINE_MARKDOWN_COMPONENTS: Components = {
  ...MARKDOWN_COMPONENTS,
  p: ({ children }) => <>{children}</>,
};

const MarkdownBody = ({ markdown }: { markdown: string }) => (
  <div className="flex flex-col gap-1">
    <ReactMarkdown components={MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
  </div>
);

/**
 * Link to the field's own heading on the connector's docs page. Inline, not inline-flex: a flex box
 * baselines on the icon's bottom edge, which drops the word below the prose it follows. The underline
 * is on the word alone so it doesn't rule through the icon.
 */
const FieldDocsLink = ({ href, fieldName }: { href: string; fieldName?: string }) => (
  <Link
    aria-label={fieldName ? `${fieldName} documentation` : 'Field documentation'}
    className="group whitespace-nowrap text-body-sm text-muted-foreground no-underline hover:text-foreground"
    href={href}
    rel="noopener noreferrer"
    target="_blank"
    tone="current"
  >
    {/* size-3 is the text's own rung; -0.15em centres it on the cap height. */}
    <BookOpenIcon className="mr-1 inline size-3 align-[-0.15em]" />
    <span className="underline decoration-dotted underline-offset-[3px] group-hover:decoration-solid">Docs</span>
  </Link>
);

// Help text and its trailing link share one line box, so the link reads as part of the sentence.
const InlineHelp = ({ children, docsLink }: { children: React.ReactNode; docsLink: React.ReactNode }) => (
  <div className="text-body-sm text-muted-foreground">
    {children} {docsLink}
  </div>
);

/** AsciiDoc `description`, rendered as Markdown and collapsed to two lines when it runs long. */
const LongDescription = ({ source, docsLink }: { source: string; docsLink: React.ReactNode }) => {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const { markdown, preview, clampable } = useMemo(() => {
    const converted = asciidocToMarkdown(source);
    const plain = markdownToPlainText(converted);
    return {
      markdown: converted,
      preview: plain,
      clampable: plain.length > CLAMP_OVER_CHARS || converted.includes('\n'),
    };
  }, [source]);

  // One paragraph, no block content: it can carry the link on its own line.
  if (!clampable) {
    return (
      <InlineHelp docsLink={docsLink}>
        <ReactMarkdown components={INLINE_MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
      </InlineHelp>
    );
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <div id={bodyId}>
        {expanded ? (
          <MarkdownBody markdown={markdown} />
        ) : (
          // Plain text collapsed: one text node, so line-clamp applies cleanly.
          <div className="line-clamp-2 text-body-sm text-muted-foreground">{preview}</div>
        )}
      </div>
      <div className="flex items-baseline gap-3">
        <button
          aria-controls={bodyId}
          aria-expanded={expanded}
          className="text-body-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
        {docsLink}
      </div>
    </div>
  );
};

/**
 * Help text under a config control. Prefers the markup-free `short_description`, falling back to the
 * AsciiDoc `description` that most fields are still limited to.
 */
export const FieldDescription = ({ spec, docsUrl }: { spec: RawFieldSpec; docsUrl?: string }) => {
  const docsLink = docsUrl ? <FieldDocsLink fieldName={spec.name} href={docsUrl} /> : null;
  const short = spec.shortDescription?.trim();
  if (short) {
    return <InlineHelp docsLink={docsLink}>{short}</InlineHelp>;
  }
  const description = spec.description?.trim();
  if (!description) {
    return docsLink;
  }
  return <LongDescription docsLink={docsLink} source={description} />;
};
