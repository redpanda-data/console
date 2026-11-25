import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import {
  aliasTermsForName,
  buildEmptyMessage,
  byProminence,
  COMPONENT_ALIASES,
  computeSuggested,
  matchRank,
  searchableText,
} from './connect-command-palette-utils';
import { describe, expect, test } from 'bun:test';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import { createComponentFixture } from '../utils/__fixtures__/component-spec';

const spec = (
  name: string,
  status: ComponentStatus = ComponentStatus.STABLE,
  type: ConnectComponentType = 'processor'
): ConnectComponentSpec => createComponentFixture({ name, type, status });

const sorted = (specs: ConnectComponentSpec[]) => [...specs].sort(byProminence).map((s) => s.name);

describe('byProminence', () => {
  test('sorts common components ahead of the long tail', () => {
    // `mapping` is a common processor; `avro` is not.
    expect(sorted([spec('avro'), spec('mapping')])).toStrictEqual(['mapping', 'avro']);
  });

  test('demotes experimental below stable, even when common', () => {
    const result = sorted([spec('mapping', ComponentStatus.EXPERIMENTAL), spec('avro', ComponentStatus.STABLE)]);
    // Stable (even uncommon) sorts above experimental.
    expect(result).toStrictEqual(['avro', 'mapping']);
  });

  test('falls back to alphabetical within the same prominence bucket', () => {
    expect(sorted([spec('zzz'), spec('aaa')])).toStrictEqual(['aaa', 'zzz']);
  });
});

describe('matchRank', () => {
  const gen = spec('generate');
  const text = searchableText(gen);

  test('ranks exact-name matches highest', () => {
    expect(matchRank(gen, 'generate', text)).toBe(0);
  });

  test('ranks a name prefix above a mid-name substring', () => {
    expect(matchRank(gen, 'gen', text)).toBe(1);
    expect(matchRank(gen, 'erat', text)).toBe(2);
  });

  test('ranks a body-text match below any name match', () => {
    const withSummary = { ...spec('kafka'), summary: 'streams events' } as ConnectComponentSpec;
    expect(matchRank(withSummary, 'events', searchableText(withSummary))).toBe(3);
  });

  test('returns -1 when nothing matches', () => {
    expect(matchRank(gen, 'flurb', text)).toBe(-1);
  });
});

describe('component aliases', () => {
  test('maps intent terms to a component name via its fragments', () => {
    // "queue" lists kafka, so kafka_franz surfaces under that intent.
    expect(aliasTermsForName('kafka_franz')).toContain('queue');
    expect(aliasTermsForName('kafka_franz')).toContain('stream');
  });

  test('maps transform/map intents to bloblang/mapping', () => {
    expect(aliasTermsForName('mapping')).toContain('transform');
    expect(aliasTermsForName('mapping')).toContain('map');
    expect(aliasTermsForName('bloblang')).toContain('transform');
  });

  test('returns no alias terms for a name no fragment matches', () => {
    expect(aliasTermsForName('totally_unrelated_xyz')).toStrictEqual([]);
  });

  test('matches fragments on `_`/word boundaries, not mid-token substrings', () => {
    // Whole multi-token fragments and `_`-delimited tokens match...
    expect(aliasTermsForName('rate_limit')).toContain('throttle');
    expect(aliasTermsForName('rate_limit')).toContain('ratelimit');
    expect(aliasTermsForName('json_schema')).toContain('json');
    // ...but a fragment buried mid-token doesn't (`log` inside `catalog`).
    expect(aliasTermsForName('catalog')).not.toContain('log');
  });

  test('keeps alias keys and fragments lowercase', () => {
    for (const [key, fragments] of Object.entries(COMPONENT_ALIASES)) {
      expect(key).toBe(key.toLowerCase());
      for (const fragment of fragments) {
        expect(fragment).toBe(fragment.toLowerCase());
      }
    }
  });
});

describe('searchableText', () => {
  test('folds name, summary, description and categories into one lowercased haystack', () => {
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

describe('buildEmptyMessage', () => {
  test('reports an empty catalog when there is no query', () => {
    expect(buildEmptyMessage('')).toBe('No components available.');
    expect(buildEmptyMessage('', ['processor'])).toBe('No components available.');
  });

  test('reports a plain miss without type locking', () => {
    expect(buildEmptyMessage('flurb')).toBe('No components match “flurb”.');
  });

  test('names the locked type when the slot restricts the catalog', () => {
    expect(buildEmptyMessage('flurb', ['processor'])).toBe('No processors match “flurb”.');
    expect(buildEmptyMessage('flurb', ['rate_limit'])).toBe('No rate limits match “flurb”.');
  });

  test('joins multiple locked types', () => {
    expect(buildEmptyMessage('flurb', ['cache', 'rate_limit'])).toBe('No caches or rate limits match “flurb”.');
  });

  test('points at a single out-of-scope type the query exists as', () => {
    expect(buildEmptyMessage('generate', ['processor'], ['input'])).toBe(
      'No processors match “generate” — it exists as an input.'
    );
  });

  test('lists multiple out-of-scope types with articles and "or"', () => {
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

  test('resolves the curated names for the allowed types against the catalog', () => {
    const result = computeSuggested(['input'], byName, []).map((c) => c.name);
    // Only the curated input names present in `byName` survive (redpanda/http_client are absent).
    expect(result).toStrictEqual(['kafka_franz', 'generate', 'file']);
  });

  test('drops anything already shown under Recent', () => {
    const recent = [spec('generate', ComponentStatus.STABLE, 'input')];
    const result = computeSuggested(['input'], byName, recent).map((c) => c.name);
    expect(result).not.toContain('generate');
    expect(result).toStrictEqual(['kafka_franz', 'file']);
  });

  test('returns nothing when there are no allowed types', () => {
    expect(computeSuggested(undefined, byName, [])).toStrictEqual([]);
  });
});
