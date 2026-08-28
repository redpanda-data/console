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

import { asciidocToMarkdown, asciidocToPlainText, cleanText } from './asciidoc';

describe('asciidocToMarkdown', () => {
  it('turns AsciiDoc section titles into Markdown headings instead of leaking "=="', () => {
    const out = asciidocToMarkdown('== Performance\nThis output benefits from batching.');
    expect(out).toBe('#### Performance\nThis output benefits from batching.');
    expect(out).not.toContain('== ');
  });

  it('handles multiple heading levels and keeps paragraphs separated', () => {
    const out = asciidocToMarkdown('Intro paragraph.\n\n=== Delivery Guarantees\nAt least once.');
    expect(out).toBe('Intro paragraph.\n\n#### Delivery Guarantees\nAt least once.');
  });

  it('converts link/xref macros to label text and bare URL macros to Markdown links', () => {
    expect(asciidocToMarkdown('See xref:guides:about.adoc[the guide] for details.')).toBe('See the guide for details.');
    expect(asciidocToMarkdown('Uses https://github.com/twmb/franz-go[franz-go] under the hood.')).toBe(
      'Uses [franz-go](https://github.com/twmb/franz-go) under the hood.'
    );
  });

  it('converts AsciiDoc bullets to Markdown list items', () => {
    expect(asciidocToMarkdown('* first\n* second')).toBe('- first\n- second');
  });

  // Every AWS `credentials` field ends "…can be found in xref:guides:cloud/aws.adoc[]."; dropping
  // the macro outright left the sentence as "…can be found in .".
  it('names a target for an empty-label xref rather than leaving dangling punctuation', () => {
    expect(asciidocToMarkdown('More information can be found in xref:guides:cloud/aws.adoc[].')).toBe(
      'More information can be found in the documentation.'
    );
  });

  it('keeps a macro label that contains escaped brackets, dropping the new-window flag', () => {
    // AsciiDoc escapes `]` inside a label, and a trailing `^` means "open in a new window".
    const source = 'See https://example.com/dsn[`http[s\\]://user[:pass\\]`^] here.';
    expect(asciidocToMarkdown(source)).toBe('See [`http[s]://user[:pass]`](https://example.com/dsn) here.');
  });

  it('escapes angle-bracket placeholders so Markdown does not swallow them as HTML', () => {
    const out = asciidocToMarkdown("Requests must include 'authorization: Bearer <token>' metadata.");
    expect(out).toBe(String.raw`Requests must include 'authorization: Bearer \<token>' metadata.`);
  });

  it('leaves placeholders inside code spans untouched', () => {
    expect(asciidocToMarkdown('Defaults to `redpanda_connect_jira_input_<resource>`.')).toBe(
      'Defaults to `redpanda_connect_jira_input_<resource>`.'
    );
  });

  it('flattens AsciiDoc tables to bullets and drops docs attribute lines', () => {
    const source = [
      'A Data Source Name.',
      '',
      ':driver-support: mysql=certified, postgres=certified',
      '',
      '|===',
      '| Driver | Data Source Name Format',
      '',
      '| `mysql`',
      '| `[username[:password]@]/dbname`',
      '|===',
    ].join('\n');
    expect(asciidocToMarkdown(source)).toBe(
      [
        'A Data Source Name.',
        '',
        '- Driver — Data Source Name Format',
        '',
        '- `mysql`',
        '- `[username[:password]@]/dbname`',
      ].join('\n')
    );
  });

  it('trims the leading newline that many field descriptions start with', () => {
    expect(asciidocToMarkdown('\nA list of topics to consume from.')).toBe('A list of topics to consume from.');
  });
});

describe('asciidocToPlainText', () => {
  it('reduces converted Markdown to a single line without syntax', () => {
    expect(asciidocToPlainText('\nUse `consumer_group` to share load.\n\n== Notes\n* first')).toBe(
      'Use consumer_group to share load. Notes first'
    );
  });

  it('keeps link labels and unescapes placeholders', () => {
    expect(asciidocToPlainText('See https://example.com[the docs] for <token> usage.')).toBe(
      'See the docs for <token> usage.'
    );
  });
});

describe('cleanText', () => {
  it('strips code spans and macros down to one line', () => {
    expect(cleanText('Sends to `redpanda`\nvia xref:guides:about.adoc[the guide].')).toBe(
      'Sends to redpanda via the guide.'
    );
  });

  it('substitutes a label for an empty-label xref', () => {
    expect(cleanText('Found in xref:guides:cloud/aws.adoc[].')).toBe('Found in the documentation.');
  });
});
