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

// Every empty-label xref in the schema reads "More information can be found in xref:…[].", so a
// generic noun keeps the sentence intact where dropping the macro would leave a dangling "in .".
const EMPTY_XREF_LABEL = 'the documentation';

const NEW_WINDOW_FLAG = /\^$/;
const TABLE_CELL_LINE = /^\|\s*(.*)$/;
const TABLE_CELL_SEPARATOR = /\s+\|\s+/;

// `\]` escapes the bracket; a trailing `^` is AsciiDoc's "open in a new window" flag, not text.
function macroLabel(label: string): string {
  return label.replace(/\\(.)/g, '$1').replace(NEW_WINDOW_FLAG, '').trim();
}

/**
 * Flattens `|===` tables to bullets. The schema's tables are one `| cell` per line with blank lines
 * between rows, so the row grouping survives; a real Markdown table isn't worth the conversion for
 * the handful of fields (sql_* DSN formats) that use one.
 */
function flattenTables(text: string): string {
  if (!text.includes('|===')) {
    return text;
  }
  return text
    .split('\n')
    .filter((line) => line.trim() !== '|===')
    .map((line) => {
      const cells = TABLE_CELL_LINE.exec(line.trimEnd());
      if (!cells) {
        return line;
      }
      const joined = cells[1].split(TABLE_CELL_SEPARATOR).join(' — ').trim();
      return joined ? `- ${joined}` : '';
    })
    .join('\n');
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
    .replace(URL_MACRO, (_match, _url: string, label: string) => macroLabel(label))
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
      .replace(/^:[a-zA-Z][\w-]*:.*$/gm, '')
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

/** Single-line plain text for collapsed previews: the converted Markdown with its syntax removed. */
export function asciidocToPlainText(raw: string): string {
  return asciidocToMarkdown(raw)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\\([<>])/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
