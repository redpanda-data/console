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

import type { PipelineTemplate } from '../pipeline-template-types';
import { findMissingRequiredSlot, stitchTemplateYaml } from '../template-deploy';

// YAML / Bloblang secret refs share the `${...}` syntax with JS template strings.
// Build the literal at runtime so the linter rule `noTemplateCurlyInString` is happy.
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

describe('stitchTemplateYaml', () => {
  test('wraps secret slot values in secret-ref syntax', () => {
    const template = buildTemplate();
    const yaml = stitchTemplateYaml({
      template,
      values: { dsn: 'POSTGRES_DSN_PROD', topic: 'orders', optionalNote: '' },
      components: [],
    });

    expect(yaml).toContain(`dsn: ${secretRef('POSTGRES_DSN_PROD')}`);
  });

  test('substitutes raw values for non-secret slots', () => {
    const template = buildTemplate();
    const yaml = stitchTemplateYaml({
      template,
      values: { dsn: 'X', topic: 'my-topic', optionalNote: 'hello' },
      components: [],
    });

    expect(yaml).toContain('topic: my-topic');
    expect(yaml).toContain('note: hello');
  });

  test('replaces unfilled slot tokens with empty string', () => {
    const template = buildTemplate();
    const yaml = stitchTemplateYaml({
      template,
      values: { dsn: 'X', topic: 'my-topic' },
      components: [],
    });

    expect(yaml).toContain('note: ');
    expect(yaml).not.toContain('slot.optionalNote');
  });
});

describe('findMissingRequiredSlot', () => {
  test('returns the id of the first unfilled required slot', () => {
    const template = buildTemplate();
    expect(findMissingRequiredSlot(template, { dsn: '', topic: '', optionalNote: '' })).toBe('dsn');
    expect(findMissingRequiredSlot(template, { dsn: 'X', topic: '', optionalNote: '' })).toBe('topic');
  });

  test('returns undefined when every required slot has a value', () => {
    const template = buildTemplate();
    expect(findMissingRequiredSlot(template, { dsn: 'X', topic: 'Y', optionalNote: '' })).toBeUndefined();
  });

  test('treats whitespace-only values as missing', () => {
    const template = buildTemplate();
    expect(findMissingRequiredSlot(template, { dsn: '   ', topic: 'Y' })).toBe('dsn');
  });
});
