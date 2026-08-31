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

// Descriptions longer than this (or spanning paragraphs) collapse behind "Show more"; schema prose
// runs to a few thousand characters and buries the control it belongs to.
const CLAMP_OVER_CHARS = 200;

// Field prose sits under its control, so headings collapse to the same compact label as the body.
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

const MarkdownBody = ({ markdown }: { markdown: string }) => (
  <div className="flex flex-col gap-1">
    <ReactMarkdown components={MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
  </div>
);

/**
 * Trailing link to the field's own heading on the connector's docs page. Muted and named after the
 * field, so a form of twenty of these reads as help text rather than twenty calls to action.
 *
 * Laid out inline, not inline-flex: a flex box takes its baseline from the icon's bottom edge, which
 * drops the word below the baseline of the sentence it follows. Inline keeps one shared line box, so
 * `Docs` sits on the prose baseline and the icon is placed against it by `vertical-align`. The
 * underline is on the word alone — an ancestor's decoration would rule through the icon too.
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
    {/* size-3 matches the 12px text; -0.15em centres the icon on the word's cap height. */}
    <BookOpenIcon className="mr-1 inline size-3 align-[-0.15em]" />
    <span className="underline decoration-dotted underline-offset-[3px] group-hover:decoration-solid">Docs</span>
  </Link>
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

  if (!clampable) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <MarkdownBody markdown={markdown} />
        {docsLink}
      </div>
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
      {/* The expander already earns a row here, so the docs link joins it instead of adding one. */}
      <div className="flex items-center gap-3">
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
 * Help text under a config control. Prefers the schema's `short_description` — a markup-free
 * one-liner — and falls back to the AsciiDoc `description` that most fields are still limited to.
 * `docsUrl` deep-links the field's own heading on the connector's reference page.
 */
export const FieldDescription = ({ spec, docsUrl }: { spec: RawFieldSpec; docsUrl?: string }) => {
  const docsLink = docsUrl ? <FieldDocsLink fieldName={spec.name} href={docsUrl} /> : null;
  const short = spec.shortDescription?.trim();
  if (short) {
    return (
      // A one-liner and the link share a row rather than the link claiming its own.
      <div className="text-body-sm text-muted-foreground">
        {short} {docsLink}
      </div>
    );
  }
  const description = spec.description?.trim();
  if (!description) {
    return docsLink;
  }
  return <LongDescription docsLink={docsLink} source={description} />;
};
