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

const MACRO_LABEL = String.raw`((?:\\.|[^\]\\])*)`;
const XREF_MACRO = new RegExp(String.raw`(?:xref|link):[^\s[\]]*\[${MACRO_LABEL}\]`, 'gu');
const URL_MACRO = new RegExp(String.raw`(https?://[^\s[\]]+)\[${MACRO_LABEL}\]`, 'gu');
const MARKDOWN_LINK = /\[(?<label>[^\n]*?)\]\([^)\n]*\)/gu;
const INTERNAL_XREF = /<<(?<anchor>[^>,\n]+)(?:,\s*(?<label>[^>\n]+))?>>/gu;
const NEW_WINDOW_FLAG = /\^$/u;

const EMPTY_XREF_LABEL = 'the documentation';

const ATTRIBUTE_LINE = /^:[a-zA-Z][\w-]*:.*$/gmu;
const ADMONITION_LINE = /^\[(?<kind>NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]$/gmu;
const BLOCK_ATTRIBUTE_LINE = /^\[[^\]]*\]$/gmu;
const BLOCK_DELIMITER = /^(?:={2,}|-{4,}|\*{4,}|_{4,}|\+{4,})$/gmu;
const BLOCK_TITLE_LINE = /^\.(?<title>[A-Z][^\n]*)$/gmu;
const SECTION_TITLE = /^=+\s+(?<title>.{1,60})$/gmu;
const OVERLONG_SECTION_MARKER = /^=+\s+/gmu;
const LIST_MARKER = /^\*\s+/gmu;
const BLANK_LINE_RUN = /\n{3,}/gu;

const TABLE_FENCE = /^\|===$/u;
const TABLE_RULE_ROW = /^\|[\s:|-]+$/u;
const TABLE_CELL_MARKERS = /^\|\s*|\s*\|$/gu;
const TABLE_CELL_SEPARATOR = /\s*\|\s*/u;
const DSV_TABLE_ATTRIBUTE = /^\[.*format=dsv.*\]$/u;
const DSV_CELL_SEPARATOR = /\s*:\s*/u;

const CODE_BLOCK_OR_SPAN = /(?<code>```[\s\S]*?```|`[^`\n]*`)/gu;
const PLACEHOLDER_OPENER = /<(?!https?:\/\/)(?=[a-zA-Z/])/gu;
const MARKDOWN_MARKS = /[`*]/gu;
const MARKDOWN_HEADING = /^#+\s*/gmu;
const MARKDOWN_LIST_MARKER = /^[-*]\s+/gmu;
const BACKSLASH_ESCAPE = /\\(?<escapedCharacter>.)/gu;
const WHITESPACE_RUN = /\s+/gu;
const CRLF = /\r\n/gu;

function macroLabel(label: string) {
  return label.replace(BACKSLASH_ESCAPE, '$1').replace(NEW_WINDOW_FLAG, '').trim();
}

const macrosToLabels = (text: string) =>
  text
    .replace(XREF_MACRO, (_match, label: string) => macroLabel(label) || EMPTY_XREF_LABEL)
    .replace(INTERNAL_XREF, (_match, anchor: string, label?: string) => (label ?? anchor).trim());

function flattenTables(text: string) {
  if (!text.includes('|')) {
    return text;
  }
  const state: TableState = { inFence: false, separator: TABLE_CELL_SEPARATOR };
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    const flattened = flattenTableLine(line, state);
    if (flattened !== undefined) {
      lines.push(flattened);
    }
  }
  return lines.join('\n');
}

type TableState = { inFence: boolean; separator: RegExp };

function flattenTableLine(line: string, state: TableState) {
  const trimmed = line.trim();
  if (TABLE_FENCE.test(trimmed)) {
    toggleTableFence(state);
    return;
  }
  if (!state.inFence && DSV_TABLE_ATTRIBUTE.test(trimmed)) {
    state.separator = DSV_CELL_SEPARATOR;
    return line;
  }
  const isRow = state.inFence || (trimmed.startsWith('|') && trimmed.endsWith('|'));
  return isRow ? tableRowBullet(trimmed, state) : line;
}

function toggleTableFence(state: TableState) {
  state.inFence = !state.inFence;
  if (!state.inFence) {
    state.separator = TABLE_CELL_SEPARATOR;
  }
}

function tableRowBullet(trimmed: string, state: TableState) {
  if (!state.inFence && TABLE_RULE_ROW.test(trimmed)) {
    return;
  }
  const cells = trimmed.replace(TABLE_CELL_MARKERS, '');
  return cells ? `- ${cells.split(state.separator).join(' — ')}` : '';
}

function escapePlaceholders(text: string) {
  return text
    .split(CODE_BLOCK_OR_SPAN)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(PLACEHOLDER_OPENER, String.raw`\<`)))
    .join('');
}

/**
 * AsciiDoc to Markdown for react-markdown; newlines survive, so titles and paragraphs stay distinct.
 *
 * Only pass marked-up schema prose such as descriptions and summaries; short_description is already plain. Table rows (including DSV) are flattened because react-markdown is mounted without GFM.
 *
 * Fence state controls row parsing so prose pipes survive. Placeholders outside code are escaped because disabled HTML rendering would otherwise drop them.
 */
export function asciidocToMarkdown(raw: string) {
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
export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(MARKDOWN_LINK, '$1')
    .replace(MARKDOWN_HEADING, '')
    .replace(MARKDOWN_LIST_MARKER, '')
    .replace(BACKSLASH_ESCAPE, '$1')
    .replace(MARKDOWN_MARKS, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
}
