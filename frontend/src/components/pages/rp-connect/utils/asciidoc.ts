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
 * Redpanda Connect schema prose is AsciiDoc, not Markdown: `xref:`/`link:` macros, `url[label]`
 * macros, `==` section titles, `|===` tables, `:attr:` lines, and backticks for monospace. Applies
 * to component `summary`/`description` and per-field `description`. Field `short_description`s carry
 * no markup by contract and must not be run through any of this.
 */

// A macro label, allowing AsciiDoc's `\]` escape: either an escaped pair or a plain char.
const MACRO_LABEL = String.raw`((?:\\.|[^\]\\])*)`;
const XREF_MACRO = new RegExp(String.raw`(?:xref|link):[^\s[\]]*\[${MACRO_LABEL}\]`, 'g');
const URL_MACRO = new RegExp(String.raw`(https?://[^\s[\]]+)\[${MACRO_LABEL}\]`, 'g');

// Keeps "More information can be found in xref:…[]." from rendering as "…found in .".
const EMPTY_XREF_LABEL = 'the documentation';

const NEW_WINDOW_FLAG = /\^$/;
const ATTRIBUTE_LINE = /^:[a-zA-Z][\w-]*:.*$/gm;
const TABLE_DELIMITER = /^\s*\|===\s*$/;
const LEADING_CELL_MARKER = /^\|\s*/;
const TABLE_CELL_SEPARATOR = /\s*\|\s*/;
// Admonition markers keep their label; every other block attribute (`[source,yaml]`) is docs noise.
const ADMONITION_LINE = /^\[(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]$/gm;
const BLOCK_ATTRIBUTE_LINE = /^\[[^\]]*\]$/gm;
// Block delimiters (`====` example, `----` listing). `-{4,}` leaves a Markdown `---` alone.
const BLOCK_DELIMITER = /^(?:={2,}|-{4,}|\*{4,}|_{4,}|\+{4,})$/gm;
const BLOCK_TITLE_LINE = /^\.([A-Z][^\n]*)$/gm;

// `\]` escapes the bracket; a trailing `^` is AsciiDoc's "open in a new window" flag, not text.
function macroLabel(label: string): string {
  return label.replace(/\\(.)/g, '$1').replace(NEW_WINDOW_FLAG, '').trim();
}

/**
 * Flattens `|===` tables to one bullet per source line, cells joined with an em dash. A Markdown
 * table isn't worth the conversion for the handful of fields (sql DSN formats, Debezium type maps)
 * that use one. Rows are only recognized between delimiters, so a `|` in prose is left alone.
 */
function flattenTables(text: string): string {
  if (!text.includes('|===')) {
    return text;
  }
  let inTable = false;
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (TABLE_DELIMITER.test(line)) {
      inTable = !inTable;
      continue;
    }
    if (!inTable) {
      lines.push(line);
      continue;
    }
    const row = line.trim().replace(LEADING_CELL_MARKER, '');
    lines.push(row ? `- ${row.split(TABLE_CELL_SEPARATOR).join(' — ')}` : '');
  }
  return lines.join('\n');
}

/**
 * Escapes `<placeholder>` spans outside code so Markdown keeps them: remark parses `<db>` as inline
 * HTML and, with raw HTML disabled, drops it — silently corrupting the DSN and header examples that
 * use angle-bracket placeholders. Autolinks (`<https://…>`) are left alone.
 */
function escapePlaceholders(text: string): string {
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/<(?!https?:\/\/)(?=[a-zA-Z/])/g, String.raw`\<`)))
    .join('');
}

/** Reduces one-line AsciiDoc prose (link macros, code spans) to plain label text on a single line. */
export function cleanText(text: string): string {
  return text
    .replace(XREF_MACRO, (_match, label: string) => macroLabel(label) || EMPTY_XREF_LABEL)
    .replace(URL_MACRO, (_match, url: string, label: string) => macroLabel(label) || url)
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converts the AsciiDoc constructs Connect uses to Markdown for react-markdown. Unlike
 * {@link cleanText}, newlines are preserved so titles and paragraphs stay distinct.
 */
export function asciidocToMarkdown(raw: string): string {
  return escapePlaceholders(
    flattenTables(raw.replace(/\r\n/g, '\n'))
      // Attribute definitions configure the docs build; they render as noise.
      .replace(ATTRIBUTE_LINE, '')
      .replace(ADMONITION_LINE, '**$1**')
      .replace(BLOCK_ATTRIBUTE_LINE, '')
      // Left in place, a delimiter turns the prose around it into a setext heading.
      .replace(BLOCK_DELIMITER, '')
      // Block titles (`.Endpoint caveats`) → small heading.
      .replace(BLOCK_TITLE_LINE, '#### $1')
      // Link macros → label text.
      .replace(XREF_MACRO, (_match, label: string) => macroLabel(label) || EMPTY_XREF_LABEL)
      // Bare URL macro → Markdown link.
      .replace(URL_MACRO, (_match, url: string, label: string) => {
        const text = macroLabel(label);
        return text ? `[${text}](${url})` : url;
      })
      // Section titles (`==`/`===`/… Title) → small heading.
      .replace(/^=+\s+(.{1,60})$/gm, '#### $1')
      // Strip leftover markers from over-long titles.
      .replace(/^=+\s+/gm, '')
      // List markers → bullets.
      .replace(/^\*\s+/gm, '- ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Strips Markdown syntax to a single line, for collapsed previews. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\\([<>])/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
