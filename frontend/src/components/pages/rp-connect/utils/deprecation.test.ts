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

import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { deprecationMessage, deprecationNotice, findDeprecatedUsages } from './deprecation';
import { describe, expect, it } from 'bun:test';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';

const spec = (
  name: string,
  type: ConnectComponentType,
  status = ComponentStatus.STABLE,
  description = ''
): ConnectComponentSpec => ({ name, type, status, description }) as ConnectComponentSpec;

// Deprecation paragraphs as the 4.116 schema serves them.
const KAFKA_FRANZ_INPUT = spec(
  'kafka_franz',
  'input',
  ComponentStatus.DEPRECATED,
  '\nThis input is deprecated as of version 4.68.0. Use the xref:components:inputs/redpanda.adoc[`redpanda` input] instead.\n\nWhen a consumer group is specified this input consumes one or more topics.'
);
const REDPANDA_COMMON_OUTPUT = spec(
  'redpanda_common',
  'output',
  ComponentStatus.DEPRECATED,
  'This output is deprecated as of version 4.68.0. Use the xref:components:outputs/redpanda.adoc[`redpanda` output] instead. When you omit its `seed_brokers` field, the `redpanda` output takes its connection configuration from the top-level xref:components:redpanda/about.adoc[`redpanda` block].'
);
const PG_STREAM_INPUT = spec(
  'pg_stream',
  'input',
  ComponentStatus.DEPRECATED,
  "Streams changes from a PostgreSQL database.\n\nThis input was introduced in version 4.40.0 as `pg_stream` and renamed to `postgres_cdc` in version 4.43.0. The `pg_stream` name still works, but it's deprecated.\n\n== Requirements"
);
const JIRA_PROCESSOR = spec(
  'jira',
  'processor',
  ComponentStatus.DEPRECATED,
  'Executes Jira API queries.\n\nSince version 4.100.0, this processor is deprecated in favour of the xref:components:inputs/jira.adoc[`jira` input], which streams issues.'
);
const KAFKA_OUTPUT = spec(
  'kafka',
  'output',
  ComponentStatus.DEPRECATED,
  '\nThis output is deprecated as of version 4.113.0. Use the xref:components:outputs/redpanda.adoc[`redpanda` output] instead.'
);

const CATALOG = [
  KAFKA_FRANZ_INPUT,
  REDPANDA_COMMON_OUTPUT,
  PG_STREAM_INPUT,
  JIRA_PROCESSOR,
  KAFKA_OUTPUT,
  spec('redpanda', 'input'),
  spec('redpanda', 'output'),
  spec('postgres_cdc', 'input'),
  spec('jira', 'input'),
  spec('generate', 'input'),
  spec('mapping', 'processor'),
  spec('memory', 'cache'),
];

describe('deprecationNotice', () => {
  it('reads the replacement from the deprecation paragraph xref', () => {
    expect(deprecationNotice(KAFKA_FRANZ_INPUT, CATALOG)).toEqual({
      name: 'kafka_franz',
      type: 'input',
      replacement: { name: 'redpanda', type: 'input' },
      docsUrl: expect.stringContaining('/inputs/redpanda/'),
    });
  });

  it('skips xrefs that are not component pages', () => {
    expect(deprecationNotice(REDPANDA_COMMON_OUTPUT, CATALOG).replacement).toEqual({
      name: 'redpanda',
      type: 'output',
    });
  });

  it('reads a rename as a same-type replacement', () => {
    expect(deprecationNotice(PG_STREAM_INPUT, CATALOG).replacement).toEqual({ name: 'postgres_cdc', type: 'input' });
  });

  it('keeps a replacement of another component type', () => {
    expect(deprecationNotice(JIRA_PROCESSOR, CATALOG).replacement).toEqual({ name: 'jira', type: 'input' });
  });

  it('falls back to the upstream replacement when an older schema names none', () => {
    const preNotice = spec('kafka_franz', 'input', ComponentStatus.DEPRECATED, 'A Kafka input using franz-go.');
    expect(deprecationNotice(preNotice, CATALOG).replacement).toEqual({ name: 'redpanda', type: 'input' });
  });

  it('drops a replacement this dataplane does not serve, and links the component’s own docs', () => {
    const notice = deprecationNotice(KAFKA_FRANZ_INPUT, [KAFKA_FRANZ_INPUT]);
    expect(notice.replacement).toBeUndefined();
    expect(notice.docsUrl).toContain('/inputs/kafka_franz/');
  });

  it('drops a replacement that is itself deprecated', () => {
    const deprecatedRedpanda = spec('redpanda', 'input', ComponentStatus.DEPRECATED);
    expect(deprecationNotice(KAFKA_FRANZ_INPUT, [KAFKA_FRANZ_INPUT, deprecatedRedpanda]).replacement).toBeUndefined();
  });

  it('has no replacement when the description names none', () => {
    const bare = spec('old_thing', 'processor', ComponentStatus.DEPRECATED, 'Does a thing.');
    expect(deprecationNotice(bare, CATALOG).replacement).toBeUndefined();
  });
});

describe('deprecationMessage', () => {
  it('names the replacement and its type', () => {
    expect(deprecationMessage(deprecationNotice(JIRA_PROCESSOR, CATALOG))).toBe(
      'jira is deprecated. Use the jira input instead.'
    );
  });

  it('says only that it is deprecated when there is no replacement', () => {
    expect(deprecationMessage({ name: 'old_thing', type: 'rate_limit' })).toBe(
      'old_thing is deprecated and may be removed in a future release.'
    );
  });
});

describe('findDeprecatedUsages', () => {
  it('finds nothing when the config uses no deprecated component', () => {
    expect(findDeprecatedUsages('input:\n  generate:\n    mapping: root = {}\n', CATALOG)).toEqual([]);
  });

  it('points at the component key, after a leading label', () => {
    const yaml = 'input:\n  label: source\n  kafka_franz:\n    topics: [a]\n';
    const [usage] = findDeprecatedUsages(yaml, CATALOG);
    expect(usage.notice.name).toBe('kafka_franz');
    expect(usage.range).toEqual({ startLineNumber: 3, startColumn: 3, endLineNumber: 3, endColumn: 14 });
  });

  it('matches by component type, not just name', () => {
    // `kafka` is deprecated only as an output here; the processor named `jira` is, the input isn't.
    const yaml = 'input:\n  jira: {}\noutput:\n  kafka:\n    topic: a\n';
    expect(findDeprecatedUsages(yaml, CATALOG).map((u) => `${u.notice.type}:${u.notice.name}`)).toEqual([
      'output:kafka',
    ]);
  });

  it('finds nested processors and gives each its flow-node id', () => {
    const yaml = [
      'input:',
      '  generate:',
      '    mapping: root = {}',
      'pipeline:',
      '  processors:',
      '    - mapping: root = this',
      '    - branch:',
      '        processors:',
      '          - jira:',
      '              jql: project = UX',
      'output:',
      '  redpanda_common:',
      '    topic: out',
    ].join('\n');
    const usages = findDeprecatedUsages(yaml, CATALOG);
    expect(usages.map((u) => [u.notice.name, u.range.startLineNumber])).toEqual([
      ['jira', 9],
      ['redpanda_common', 12],
    ]);
    expect(new Set(usages.map((u) => u.nodeId)).size).toBe(2);
  });

  it('keeps flagging the key while its value is mid-edit', () => {
    const usages = findDeprecatedUsages('input:\n  kafka_franz: [\n', CATALOG);
    expect(usages.map((u) => [u.notice.name, u.range.startLineNumber])).toEqual([['kafka_franz', 2]]);
  });
});
