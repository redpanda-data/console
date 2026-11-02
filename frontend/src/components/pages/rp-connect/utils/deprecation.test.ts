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
import type { ConnectComponentSpec, ConnectComponentType, RawFieldSpec } from '../types/schema';

const field = (name: string, type: string, kind = 'scalar', children?: RawFieldSpec[]) =>
  ({ name, type, kind, children }) as RawFieldSpec;

const spec = (
  name: string,
  type: ConnectComponentType,
  status = ComponentStatus.STABLE,
  config = field('', 'object')
): ConnectComponentSpec => ({ name, type, status, config }) as ConnectComponentSpec;

const DEPRECATED = ComponentStatus.DEPRECATED;
const KAFKA_FRANZ_INPUT = spec('kafka_franz', 'input', DEPRECATED);
const JIRA_PROCESSOR = spec('jira', 'processor', DEPRECATED);

const CATALOG = [
  KAFKA_FRANZ_INPUT,
  JIRA_PROCESSOR,
  spec('kafka', 'output', DEPRECATED),
  spec('redpanda', 'input'),
  spec('redpanda', 'output'),
  spec('jira', 'input'),
  spec('generate', 'input'),
  spec('read_until', 'input', ComponentStatus.STABLE, field('', 'object', 'scalar', [field('input', 'input')])),
  spec('retry', 'output', ComponentStatus.STABLE, field('', 'object', 'scalar', [field('output', 'output')])),
  spec('try', 'processor', ComponentStatus.STABLE, field('', 'processor', 'array')),
  spec(
    'workflow',
    'processor',
    ComponentStatus.STABLE,
    field('', 'object', 'scalar', [field('branches', 'object', 'map', [field('processors', 'processor', 'array')])])
  ),
];

describe('deprecationNotice', () => {
  it('names the replacement and links its docs', () => {
    expect(deprecationNotice(KAFKA_FRANZ_INPUT, CATALOG)).toEqual({
      name: 'kafka_franz',
      type: 'input',
      replacement: { name: 'redpanda', type: 'input' },
      docsUrl: expect.stringContaining('/inputs/redpanda/'),
    });
  });

  it('keeps a replacement of another component type', () => {
    expect(deprecationNotice(JIRA_PROCESSOR, CATALOG).replacement).toEqual({ name: 'jira', type: 'input' });
  });

  it('drops a replacement this dataplane does not serve, and links the component’s own docs', () => {
    const notice = deprecationNotice(KAFKA_FRANZ_INPUT, [KAFKA_FRANZ_INPUT]);
    expect(notice.replacement).toBeUndefined();
    expect(notice.docsUrl).toContain('/inputs/kafka_franz/');
  });

  it('drops a replacement that is itself deprecated', () => {
    expect(deprecationNotice(KAFKA_FRANZ_INPUT, [spec('redpanda', 'input', DEPRECATED)]).replacement).toBeUndefined();
  });
});

describe('deprecationMessage', () => {
  it('names the replacement and its type, or says it may be removed', () => {
    expect(deprecationMessage(deprecationNotice(JIRA_PROCESSOR, CATALOG))).toBe(
      'jira is deprecated. Use the jira input instead.'
    );
    expect(deprecationMessage({ name: 'old_thing', type: 'rate_limit' })).toBe(
      'old_thing is deprecated and may be removed in a future release.'
    );
  });
});

const usagesIn = (yaml: string) =>
  findDeprecatedUsages(yaml, CATALOG).map((u) => `${u.notice.type}:${u.notice.name}@${u.range.startLineNumber}`);

describe('findDeprecatedUsages', () => {
  it('finds nothing when the config uses no deprecated component', () => {
    expect(usagesIn('input:\n  generate:\n    mapping: root = {}\n')).toEqual([]);
  });

  it('points at the component key, whatever keys come before it', () => {
    const [usage] = findDeprecatedUsages('input:\n  label: source\n  kafka_franz:\n    topics: [a]\n', CATALOG);
    expect(usage.range).toEqual({ startLineNumber: 3, startColumn: 3, endLineNumber: 3, endColumn: 14 });
  });

  it('matches by component type, not just name', () => {
    expect(usagesIn('input:\n  jira: {}\noutput:\n  kafka:\n    topic: a\n')).toEqual(['output:kafka@4']);
  });

  it('follows component-typed fields into nested components', () => {
    const yaml = [
      'input:',
      '  read_until:',
      '    input:',
      '      kafka_franz: {}',
      '  processors:',
      '    - jira: {}',
      'pipeline:',
      '  processors:',
      '    - try:',
      '        - jira: {}',
      '    - workflow:',
      '        branches:',
      '          a:',
      '            processors:',
      '              - jira: {}',
      'output:',
      '  retry:',
      '    output:',
      '      kafka: {}',
    ].join('\n');
    expect(usagesIn(yaml)).toEqual([
      'input:kafka_franz@4',
      'processor:jira@6',
      'processor:jira@10',
      'processor:jira@15',
      'output:kafka@19',
    ]);
  });

  it('keeps flagging the key while its value is mid-edit', () => {
    expect(usagesIn('input:\n  kafka_franz: [\n')).toEqual(['input:kafka_franz@2']);
  });
});
