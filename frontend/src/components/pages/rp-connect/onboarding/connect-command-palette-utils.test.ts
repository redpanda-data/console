import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { describe, expect, it } from 'vitest';

import {
  aliasTermsForName,
  asciidocToMarkdown,
  buildEmptyMessage,
  byProminence,
  COMPONENT_ALIASES,
  computeSuggested,
  matchRank,
  searchableText,
} from './connect-command-palette-utils';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';

const spec = (
  name: string,
  status: ComponentStatus = ComponentStatus.STABLE,
  type: ConnectComponentType = 'processor'
): ConnectComponentSpec => ({ name, type, status }) as ConnectComponentSpec;

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

describe('matchRank', () => {
  const gen = spec('generate');
  const text = searchableText(gen);

  it('ranks exact-name matches highest', () => {
    expect(matchRank(gen, 'generate', text)).toBe(0);
  });

  it('ranks a name prefix above a mid-name substring', () => {
    expect(matchRank(gen, 'gen', text)).toBe(1);
    expect(matchRank(gen, 'erat', text)).toBe(2);
  });

  it('ranks a body-text match below any name match', () => {
    const withSummary = { ...spec('kafka'), summary: 'streams events' } as ConnectComponentSpec;
    expect(matchRank(withSummary, 'events', searchableText(withSummary))).toBe(3);
  });

  it('returns -1 when nothing matches', () => {
    expect(matchRank(gen, 'flurb', text)).toBe(-1);
  });
});

describe('component aliases', () => {
  it('maps intent terms to a component name via its fragments', () => {
    // "queue" lists kafka, so kafka_franz surfaces under that intent.
    expect(aliasTermsForName('kafka_franz')).toContain('queue');
    expect(aliasTermsForName('kafka_franz')).toContain('stream');
  });

  it('maps transform/map intents to bloblang/mapping', () => {
    expect(aliasTermsForName('mapping')).toEqual(expect.arrayContaining(['transform', 'map']));
    expect(aliasTermsForName('bloblang')).toContain('transform');
  });

  it('returns no alias terms for a name no fragment matches', () => {
    expect(aliasTermsForName('totally_unrelated_xyz')).toEqual([]);
  });

  it('matches fragments on `_`/word boundaries, not mid-token substrings', () => {
    // Whole multi-token fragments and `_`-delimited tokens match...
    expect(aliasTermsForName('rate_limit')).toEqual(expect.arrayContaining(['throttle', 'ratelimit']));
    expect(aliasTermsForName('json_schema')).toContain('json');
    // ...but a fragment buried mid-token doesn't (`log` inside `catalog`).
    expect(aliasTermsForName('catalog')).not.toContain('log');
  });

  it('keeps alias keys and fragments lowercase', () => {
    for (const [key, fragments] of Object.entries(COMPONENT_ALIASES)) {
      expect(key).toBe(key.toLowerCase());
      for (const fragment of fragments) {
        expect(fragment).toBe(fragment.toLowerCase());
      }
    }
  });
});

describe('searchableText', () => {
  it('folds name, summary, description and categories into one lowercased haystack', () => {
    const component = {
      ...spec('http_client'),
      summary: 'Sends HTTP requests',
      description: 'Talks to REST endpoints',
      categories: ['Network'],
    } as ConnectComponentSpec;
    const text = searchableText(component);
    expect(text).toContain('http_client');
    expect(text).toContain('sends http requests');
    expect(text).toContain('rest endpoints');
    expect(text).toContain('network');
    expect(text).toBe(text.toLowerCase());
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

describe('buildEmptyMessage', () => {
  it('reports an empty catalog when there is no query', () => {
    expect(buildEmptyMessage('')).toBe('No components available.');
    expect(buildEmptyMessage('', ['processor'])).toBe('No components available.');
  });

  it('reports a plain miss without type locking', () => {
    expect(buildEmptyMessage('flurb')).toBe('No components match “flurb”.');
  });

  it('names the locked type when the slot restricts the catalog', () => {
    expect(buildEmptyMessage('flurb', ['processor'])).toBe('No processors match “flurb”.');
    expect(buildEmptyMessage('flurb', ['rate_limit'])).toBe('No rate limits match “flurb”.');
  });

  it('joins multiple locked types', () => {
    expect(buildEmptyMessage('flurb', ['cache', 'rate_limit'])).toBe('No caches or rate limits match “flurb”.');
  });

  it('points at a single out-of-scope type the query exists as', () => {
    expect(buildEmptyMessage('generate', ['processor'], ['input'])).toBe(
      'No processors match “generate” — it exists as an input.'
    );
  });

  it('lists multiple out-of-scope types with articles and "or"', () => {
    expect(buildEmptyMessage('kafka_franz', ['processor'], ['input', 'output'])).toBe(
      'No processors match “kafka_franz” — it exists as an input or an output.'
    );
    expect(buildEmptyMessage('redis', ['input'], ['cache', 'processor', 'rate_limit'])).toBe(
      'No inputs match “redis” — it exists as a cache, a processor or a rate limit.'
    );
  });
});

describe('computeSuggested', () => {
  const byName = new Map<string, ConnectComponentSpec>([
    ['generate', spec('generate', ComponentStatus.STABLE, 'input')],
    ['kafka_franz', spec('kafka_franz', ComponentStatus.STABLE, 'input')],
    ['file', spec('file', ComponentStatus.STABLE, 'input')],
  ]);

  it('resolves the curated names for the allowed types against the catalog', () => {
    const result = computeSuggested(['input'], byName, []).map((c) => c.name);
    // Only the curated input names present in `byName` survive (redpanda/http_client are absent).
    expect(result).toEqual(['kafka_franz', 'generate', 'file']);
  });

  it('drops anything already shown under Recent', () => {
    const recent = [spec('generate', ComponentStatus.STABLE, 'input')];
    const result = computeSuggested(['input'], byName, recent).map((c) => c.name);
    expect(result).not.toContain('generate');
    expect(result).toEqual(['kafka_franz', 'file']);
  });

  it('returns nothing when there are no allowed types', () => {
    expect(computeSuggested(undefined, byName, [])).toEqual([]);
  });
});
