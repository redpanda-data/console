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

import { describe, expect, test } from 'vitest';
import { parseDocument } from 'yaml';

import type { PipelineTemplate } from '../pipeline-template-types';
import { stitchTemplateYaml } from '../template-deploy';

// Build `${...}` tokens at runtime so biome's noTemplateCurlyInString doesn't fire.
const DOLLAR = '$';
const secretRef = (name: string) => `${DOLLAR}{secrets.${name}}`;
const slotToken = (id: string) => `${DOLLAR}{slot.${id}}`;

const buildTemplate = (overrides?: Partial<PipelineTemplate>): PipelineTemplate => ({
  id: 'test-template',
  name: 'Test',
  description: 'A test template',
  category: 'cdc',
  source: { component: 'redpanda', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 3,
  defaultPipelineName: 'test',
  slots: [
    {
      id: 'dsn',
      kind: 'secret',
      section: 'source',
      label: 'DSN',
      required: true,
      suggestedName: 'TEST_DSN',
    },
    {
      id: 'topic',
      kind: 'topic',
      section: 'sink',
      label: 'Topic',
      required: true,
    },
    {
      id: 'optionalNote',
      kind: 'string',
      section: 'options',
      label: 'Optional',
    },
  ],
  baseYaml: [
    'input:',
    '  postgres_cdc:',
    `    dsn: ${slotToken('dsn')}`,
    'output:',
    '  redpanda:',
    `    topic: ${slotToken('topic')}`,
    `    note: ${slotToken('optionalNote')}`,
    '',
  ].join('\n'),
  ...overrides,
});

const stitch = (template: PipelineTemplate, values: Record<string, string>) =>
  stitchTemplateYaml({ template, values, pipelineName: 'test-pipeline' });

describe('stitchTemplateYaml', () => {
  test('wraps secret slot values in secret-ref syntax', () => {
    const yaml = stitch(buildTemplate(), { dsn: 'POSTGRES_DSN_PROD', topic: 'orders', optionalNote: '' });

    expect(yaml).toContain(`dsn: ${secretRef('POSTGRES_DSN_PROD')}`);
  });

  test('substitutes raw values for non-secret slots', () => {
    const yaml = stitch(buildTemplate(), { dsn: 'X', topic: 'my-topic', optionalNote: 'hello' });

    expect(yaml).toContain('topic: my-topic');
    expect(yaml).toContain('note: hello');
  });

  test('drops the YAML key entirely when an optional slot is blank', () => {
    const yaml = stitch(buildTemplate(), { dsn: 'X', topic: 'my-topic' });

    // The `note:` value referenced `${slot.optionalNote}`, which resolved to ''.
    // We drop the key so the connector falls back to its own default rather than
    // receiving an empty value (or a `note: null`) it may reject.
    expect(yaml).not.toMatch(/^\s*note:/m);
    expect(yaml).not.toContain('slot.optionalNote');
  });

  test('keeps the YAML key when an optional slot is filled', () => {
    const yaml = stitch(buildTemplate(), { dsn: 'X', topic: 'my-topic', optionalNote: 'hello' });

    expect(yaml).toContain('note: hello');
  });

  test('treats whitespace-only slot values as blank and drops the key', () => {
    const yaml = stitch(buildTemplate(), { dsn: 'X', topic: 'my-topic', optionalNote: '   ' });

    expect(yaml).not.toMatch(/^\s*note:/m);
  });

  test('emits a generated value for a blank slot that declares defaultWhenBlank', () => {
    const template = buildTemplate({
      slots: [
        { id: 'dsn', kind: 'secret', section: 'source', label: 'DSN', required: true, suggestedName: 'TEST_DSN' },
        { id: 'topic', kind: 'topic', section: 'sink', label: 'Topic', required: true },
        {
          id: 'optionalNote',
          kind: 'string',
          section: 'options',
          label: 'Optional',
          defaultWhenBlank: ({ pipelineName }) => `auto-${pipelineName}`,
        },
      ],
    });
    const yaml = stitch(template, { dsn: 'X', topic: 'my-topic', optionalNote: '' });

    expect(yaml).toContain('note: auto-test-pipeline');
  });

  test('removes a sequence item for a blank slot and drops the now-empty key', () => {
    const template = buildTemplate({
      baseYaml: ['input:', '  redpanda:', '    topics:', `      - ${slotToken('topic')}`, ''].join('\n'),
      slots: [{ id: 'topic', kind: 'topic', section: 'source', label: 'Topic' }],
    });
    const yaml = stitch(template, { topic: '' });
    const doc = parseDocument(yaml);

    expect(doc.errors).toHaveLength(0);
    expect(doc.getIn(['input', 'redpanda', 'topics'])).toBeUndefined();
  });

  test('substitutes tokens embedded within a larger string value', () => {
    const template = buildTemplate({
      baseYaml: ['output:', '  sql_raw:', `    query: INSERT INTO ${slotToken('topic')} VALUES ($1)`, ''].join('\n'),
      slots: [{ id: 'topic', kind: 'string', section: 'sink', label: 'Table', required: true }],
    });
    const yaml = stitch(template, { topic: 'events' });

    expect(yaml).toContain('query: INSERT INTO events VALUES ($1)');
  });

  test('produces valid YAML with a template header comment', () => {
    const yaml = stitch(buildTemplate(), { dsn: 'X', topic: 'my-topic', optionalNote: 'hi' });
    const doc = parseDocument(yaml);

    expect(doc.errors).toHaveLength(0);
    expect(yaml).toContain('# Generated from template: test-template');
  });
});
