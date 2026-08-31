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

import { describe, expect, it } from 'vitest';

import { asciidocToMarkdown, markdownToPlainText } from './asciidoc';

const lines = (...rows: string[]) => rows.join('\n');

describe('asciidocToMarkdown', () => {
  it.each([
    [
      'section titles, so no "==" leaks',
      '== Performance\nBenefits from batching.',
      '#### Performance\nBenefits from batching.',
    ],
    [
      'deeper titles, paragraphs kept apart',
      'Intro.\n\n=== Guarantees\nAt least once.',
      'Intro.\n\n#### Guarantees\nAt least once.',
    ],
    ['an over-long title, marker still stripped', `= ${'x'.repeat(70)}`, 'x'.repeat(70)],
    ['xref macros, down to their label', 'See xref:guides:about.adoc[the guide].', 'See the guide.'],
    [
      'URL macros, as Markdown links',
      'Uses https://example.com/go[franz-go].',
      'Uses [franz-go](https://example.com/go).',
    ],
    // Every AWS `credentials` field ends "…can be found in xref:guides:cloud/aws.adoc[].".
    [
      'an empty-label xref, leaving no dangling punctuation',
      'Found in xref:guides:cloud/aws.adoc[].',
      'Found in the documentation.',
    ],
    // AsciiDoc escapes `]` inside a label; a trailing `^` means "open in a new window".
    [
      'bracketed labels and the new-window flag',
      'See https://x.com/dsn[`http[s\\]://u[:p\\]`^] here.',
      'See [`http[s]://u[:p]`](https://x.com/dsn) here.',
    ],
    [
      'internal cross-references with a label',
      'Set <<batch_as_multipart, `batch_as_multipart`>> to `false`.',
      'Set `batch_as_multipart` to `false`.',
    ],
    [
      'internal cross-references without one',
      'Brokering <<patterns>> are supported.',
      'Brokering patterns are supported.',
    ],
    ['AsciiDoc bullets', '* first\n* second', '- first\n- second'],
    [
      'admonitions, block titles and block delimiters',
      lines('[CAUTION]', '.Endpoint caveats', '====', 'Order is not deterministic.', '===='),
      lines('**CAUTION**', '#### Endpoint caveats', '', 'Order is not deterministic.'),
    ],
    ['the leading newline most descriptions start with', '\nA list of topics.', 'A list of topics.'],
    [
      'angle-bracket placeholders, escaped past remark',
      "Send 'authorization: Bearer <token>'.",
      String.raw`Send 'authorization: Bearer \<token>'.`,
    ],
    [
      'placeholders inside a code span, untouched',
      'Defaults to `jira_input_<resource>`.',
      'Defaults to `jira_input_<resource>`.',
    ],
    [
      'Markdown pipe tables, header rule dropped',
      lines('Placeholders:', '', '| Driver | Style |', '|---|---|', '| `mysql` | Question mark |'),
      lines('Placeholders:', '', '- Driver — Style', '- `mysql` — Question mark'),
    ],
    [
      '`|===` tables and the `:attr:` lines around them',
      lines(
        'A DSN.',
        '',
        ':driver-support: mysql=certified',
        '',
        '|===',
        '| Driver | Format',
        '',
        '| `mysql`',
        '| `[user[:pass]@]/db`',
        '|==='
      ),
      lines('A DSN.', '', '- Driver — Format', '', '- `mysql`', '- `[user[:pass]@]/db`'),
    ],
    // The Debezium type table writes rows as `|Type Name |Bloblang Type`, unpadded.
    [
      'cells that are not padded around the marker',
      lines('|===', '|Type Name |Bloblang Type', '|==='),
      '- Type Name — Bloblang Type',
    ],
    [
      'dsv tables, split on the separator their attribute line declares',
      lines('[%header,format=dsv]', '|===', 'Snowflake type:Connect format', 'CHAR, VARCHAR:string', '|==='),
      lines('- Snowflake type — Connect format', '- CHAR, VARCHAR — string'),
    ],
    [
      'a pipe in prose, even alongside a table',
      lines('Splits on | characters.', '', '|===', '|a |b', '|==='),
      lines('Splits on | characters.', '', '- a — b'),
    ],
  ])('handles %s', (_case, source, expected) => {
    expect(asciidocToMarkdown(source)).toBe(expected);
  });
});

describe('markdownToPlainText', () => {
  it.each([
    [
      'converted Markdown to one line',
      asciidocToMarkdown('\nUse `consumer_group`.\n\n== Notes\n* first'),
      'Use consumer_group. Notes first',
    ],
    [
      'link labels, unescaping placeholders',
      asciidocToMarkdown('See https://x.com[the docs] for <token> usage.'),
      'See the docs for <token> usage.',
    ],
    // The sql `dsn` fields document a bracket-heavy DSN inside the link label.
    [
      'a link whose label nests brackets',
      'A DSN: [`ch://[user[:pass]@][host]`](https://x.com/dsn) applies.',
      'A DSN: ch://[user[:pass]@][host] applies.',
    ],
  ])('reduces %s', (_case, markdown, expected) => {
    expect(markdownToPlainText(markdown)).toBe(expected);
  });
});
