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

/**
 * Connect schema prose is AsciiDoc, not Markdown — component `summary`/`description` and per-field
 * `description`. `short_description` carries no markup by contract and must not come through here.
 */

// Macro label, allowing AsciiDoc's `\]` escape.
const MACRO_LABEL = String.raw`((?:\\.|[^\]\\])*)`;
const XREF_MACRO = new RegExp(String.raw`(?:xref|link):[^\s[\]]*\[${MACRO_LABEL}\]`, 'g');
const URL_MACRO = new RegExp(String.raw`(https?://[^\s[\]]+)\[${MACRO_LABEL}\]`, 'g');
// Lazy up to the `](`, so brackets nested in the label (code-spanned DSN examples) stay part of it.
const MARKDOWN_LINK = /\[([^\n]*?)\]\([^)\n]*\)/g;
const INTERNAL_XREF = /<<([^>,\n]+)(?:,\s*([^>\n]+))?>>/g;
const NEW_WINDOW_FLAG = /\^$/;

// So "found in xref:…[]." doesn't render as "found in .".
const EMPTY_XREF_LABEL = 'the documentation';

const ATTRIBUTE_LINE = /^:[a-zA-Z][\w-]*:.*$/gm;
// Admonitions keep their label; every other block attribute (`[source,yaml]`) is docs noise.
const ADMONITION_LINE = /^\[(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]$/gm;
const BLOCK_ATTRIBUTE_LINE = /^\[[^\]]*\]$/gm;
// `-{4,}` leaves a Markdown `---` alone.
const BLOCK_DELIMITER = /^(?:={2,}|-{4,}|\*{4,}|_{4,}|\+{4,})$/gm;
const BLOCK_TITLE_LINE = /^\.([A-Z][^\n]*)$/gm;
const SECTION_TITLE = /^=+\s+(.{1,60})$/gm;
const OVERLONG_SECTION_MARKER = /^=+\s+/gm;
const LIST_MARKER = /^\*\s+/gm;
const BLANK_LINE_RUN = /\n{3,}/g;

const TABLE_FENCE = /^\|===$/;
const TABLE_RULE_ROW = /^\|[\s:|-]+$/;
const TABLE_CELL_MARKERS = /^\|\s*|\s*\|$/g;
const TABLE_CELL_SEPARATOR = /\s*\|\s*/;
// `[%header,format=dsv]` tables separate cells with `:` instead.
const DSV_TABLE_ATTRIBUTE = /^\[.*format=dsv.*\]$/;
const DSV_CELL_SEPARATOR = /\s*:\s*/;

const CODE_BLOCK_OR_SPAN = /(```[\s\S]*?```|`[^`\n]*`)/g;
const PLACEHOLDER_OPENER = /<(?!https?:\/\/)(?=[a-zA-Z/])/g;
const MARKDOWN_MARKS = /[`*]/g;
const MARKDOWN_HEADING = /^#+\s*/gm;
const MARKDOWN_LIST_MARKER = /^[-*]\s+/gm;
const BACKSLASH_ESCAPE = /\\(.)/g;
const WHITESPACE_RUN = /\s+/g;
const CRLF = /\r\n/g;

function macroLabel(label: string): string {
  return label.replace(BACKSLASH_ESCAPE, '$1').replace(NEW_WINDOW_FLAG, '').trim();
}

const macrosToLabels = (text: string): string =>
  text
    .replace(XREF_MACRO, (_match, label: string) => macroLabel(label) || EMPTY_XREF_LABEL)
    .replace(INTERNAL_XREF, (_match, anchor: string, label?: string) => (label ?? anchor).trim());

/**
 * Flattens `|===` and Markdown pipe tables to one bullet per row — react-markdown is mounted without
 * remark-gfm. Outside a fence a row must be pipe-delimited at both ends, so prose keeps its `|`.
 */
function flattenTables(text: string): string {
  if (!text.includes('|')) {
    return text;
  }
  let inFence = false;
  let separator = TABLE_CELL_SEPARATOR;
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (TABLE_FENCE.test(trimmed)) {
      inFence = !inFence;
      if (!inFence) {
        separator = TABLE_CELL_SEPARATOR;
      }
      continue;
    }
    if (!inFence && DSV_TABLE_ATTRIBUTE.test(trimmed)) {
      separator = DSV_CELL_SEPARATOR;
      lines.push(line);
      continue;
    }
    const isRow = inFence || (trimmed.startsWith('|') && trimmed.endsWith('|'));
    if (!isRow) {
      lines.push(line);
      continue;
    }
    // A Markdown header rule (`|---|---|`) carries no content; inside a fence it could be a row.
    if (!inFence && TABLE_RULE_ROW.test(trimmed)) {
      continue;
    }
    const cells = trimmed.replace(TABLE_CELL_MARKERS, '');
    lines.push(cells ? `- ${cells.split(separator).join(' — ')}` : '');
  }
  return lines.join('\n');
}

/** Escapes `<placeholder>` outside code: remark reads it as inline HTML and, with HTML off, drops it. */
function escapePlaceholders(text: string): string {
  return text
    .split(CODE_BLOCK_OR_SPAN)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(PLACEHOLDER_OPENER, String.raw`\<`)))
    .join('');
}

/** AsciiDoc to Markdown for react-markdown; newlines survive, so titles and paragraphs stay distinct. */
export function asciidocToMarkdown(raw: string): string {
  return escapePlaceholders(
    macrosToLabels(flattenTables(raw.replace(CRLF, '\n')))
      .replace(ATTRIBUTE_LINE, '')
      .replace(ADMONITION_LINE, '**$1**')
      .replace(BLOCK_ATTRIBUTE_LINE, '')
      .replace(BLOCK_DELIMITER, '')
      .replace(BLOCK_TITLE_LINE, '#### $1')
      .replace(URL_MACRO, (_match, url: string, label: string) => {
        const text = macroLabel(label);
        return text ? `[${text}](${url})` : url;
      })
      .replace(SECTION_TITLE, '#### $1')
      .replace(OVERLONG_SECTION_MARKER, '')
      .replace(LIST_MARKER, '- ')
      .replace(BLANK_LINE_RUN, '\n\n')
      .trim()
  );
}

/** Strips Markdown syntax to a single line, for collapsed previews. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(MARKDOWN_LINK, '$1')
    .replace(MARKDOWN_HEADING, '')
    .replace(MARKDOWN_LIST_MARKER, '')
    .replace(BACKSLASH_ESCAPE, '$1')
    .replace(MARKDOWN_MARKS, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}
