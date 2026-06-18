import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { describe, expect, it } from 'vitest';

import { asciidocToMarkdown, byProminence } from './connect-command-palette';
import type { ConnectComponentSpec } from '../types/schema';

const spec = (name: string, status: ComponentStatus = ComponentStatus.STABLE): ConnectComponentSpec =>
  ({ name, type: 'processor', status }) as ConnectComponentSpec;

const sorted = (specs: ConnectComponentSpec[]) => [...specs].sort(byProminence).map((s) => s.name);

describe('byProminence', () => {
  it('sorts common components ahead of the long tail', () => {
    // `mapping` is a common processor; `avro` is not.
    expect(sorted([spec('avro'), spec('mapping')])).toEqual(['mapping', 'avro']);
  });

  it('demotes deprecated and experimental below stable, even when common', () => {
    const result = sorted([
      spec('mapping', ComponentStatus.DEPRECATED),
      spec('avro', ComponentStatus.STABLE),
      spec('parquet', ComponentStatus.EXPERIMENTAL),
    ]);
    // Stable (even uncommon) sorts above demoted ones; deprecated/experimental sink.
    expect(result[0]).toBe('avro');
    expect(result.slice(1).sort()).toEqual(['mapping', 'parquet']);
  });

  it('falls back to alphabetical within the same prominence bucket', () => {
    expect(sorted([spec('zzz'), spec('aaa')])).toEqual(['aaa', 'zzz']);
  });
});

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
});
