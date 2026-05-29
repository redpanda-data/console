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

import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { describe, expect, test } from 'vitest';

import type { PipelineTemplate, TemplateSlot } from '../pipeline-template-types';
import { applySchemaToSlots } from '../template-schema';

// Minimal stand-in for the live ComponentList. `applySchemaToSlots` only reads
// `inputs`/`outputs` and each component's `config` field tree, so a plain object
// cast to the proto type is enough — matching how template-schema-paths.test.tsx
// treats the committed snapshot.
const componentList = {
  inputs: [
    {
      name: 'postgres_cdc',
      config: {
        children: [
          // Has a default → not required by checkRequired.
          { name: 'dsn', type: 'string', kind: 'scalar', description: 'Postgres DSN', defaultValue: 'pg-default' },
          // No default → required by checkRequired.
          { name: 'snapshot', type: 'string', kind: 'scalar', description: 'Snapshot mode' },
        ],
      },
    },
  ],
  outputs: [
    {
      name: 'redpanda',
      config: {
        children: [
          { name: 'topic', type: 'string', kind: 'scalar', description: 'Target topic', defaultValue: 'orders' },
        ],
      },
    },
  ],
} as unknown as ComponentList;

const slot = (
  overrides: Partial<TemplateSlot> & Pick<TemplateSlot, 'id' | 'kind' | 'section' | 'label'>
): TemplateSlot => ({ ...overrides }) as TemplateSlot;

const buildTemplate = (slots: TemplateSlot[]): PipelineTemplate => ({
  id: 'postgres-cdc-to-redpanda',
  name: 'Postgres CDC to Redpanda',
  description: 'A test template',
  category: 'cdc',
  source: { component: 'postgres_cdc', type: 'input' },
  sink: { component: 'redpanda', type: 'output' },
  setupTimeMinutes: 3,
  defaultPipelineName: 'pg-cdc',
  slots,
  baseYaml: 'input: {}\n',
});

describe('applySchemaToSlots', () => {
  test('returns the slots untouched when no component list is available', () => {
    const template = buildTemplate([slot({ id: 'dsn', kind: 'secret', section: 'source', label: 'DSN' })]);

    expect(applySchemaToSlots(template, undefined)).toBe(template.slots);
  });

  test('passes through slots without a schemaField', () => {
    const template = buildTemplate([slot({ id: 'note', kind: 'string', section: 'options', label: 'Note' })]);

    const [result] = applySchemaToSlots(template, componentList);
    expect(result).toEqual(template.slots[0]);
    expect(result.description).toBeUndefined();
  });

  test('fills a blank description from the resolved schema field', () => {
    const template = buildTemplate([
      slot({ id: 'snapshot', kind: 'string', section: 'source', label: 'Snapshot', schemaField: 'snapshot' }),
    ]);

    const [result] = applySchemaToSlots(template, componentList);
    expect(result.description).toBe('Snapshot mode');
  });

  test('keeps an explicit slot description over the schema description', () => {
    const template = buildTemplate([
      slot({
        id: 'snapshot',
        kind: 'string',
        section: 'source',
        label: 'Snapshot',
        description: 'Custom description',
        schemaField: 'snapshot',
      }),
    ]);

    const [result] = applySchemaToSlots(template, componentList);
    expect(result.description).toBe('Custom description');
  });

  test('derives required from the schema when the slot does not set it', () => {
    const template = buildTemplate([
      // schema field has no default → required
      slot({ id: 'snapshot', kind: 'string', section: 'source', label: 'Snapshot', schemaField: 'snapshot' }),
      // schema field has a default → not required
      slot({ id: 'dsn', kind: 'string', section: 'source', label: 'DSN', schemaField: 'dsn' }),
    ]);

    const [snapshot, dsn] = applySchemaToSlots(template, componentList);
    expect(snapshot.required).toBe(true);
    expect(dsn.required).toBe(false);
  });

  test('keeps an explicit slot required flag over the schema', () => {
    const template = buildTemplate([
      // schema would mark this required, but the slot opts out explicitly
      slot({
        id: 'snapshot',
        kind: 'string',
        section: 'source',
        label: 'Snapshot',
        required: false,
        schemaField: 'snapshot',
      }),
    ]);

    const [result] = applySchemaToSlots(template, componentList);
    expect(result.required).toBe(false);
  });

  test('fills a default for non-secret slots from the schema', () => {
    const template = buildTemplate([
      slot({ id: 'topic', kind: 'string', section: 'sink', label: 'Topic', schemaField: 'topic' }),
    ]);

    const [result] = applySchemaToSlots(template, componentList);
    expect(result).toMatchObject({ kind: 'string', default: 'orders' });
  });

  test('never fills a default for secret slots even when the schema field has one', () => {
    const template = buildTemplate([
      slot({ id: 'dsn', kind: 'secret', section: 'source', label: 'DSN', schemaField: 'dsn' }),
    ]);

    const [result] = applySchemaToSlots(template, componentList);
    expect(result).not.toHaveProperty('default');
    // Description and required still get enriched from the schema.
    expect(result.description).toBe('Postgres DSN');
  });

  test('passes the slot through unchanged when the schemaField path does not resolve', () => {
    const template = buildTemplate([
      slot({ id: 'ghost', kind: 'string', section: 'source', label: 'Ghost', schemaField: 'does.not.exist' }),
    ]);

    const [result] = applySchemaToSlots(template, componentList);
    expect(result).toEqual(template.slots[0]);
    expect(result.description).toBeUndefined();
  });

  test('does not enrich option-section slots (no source/sink component to resolve against)', () => {
    const template = buildTemplate([
      slot({ id: 'topic', kind: 'string', section: 'options', label: 'Topic', schemaField: 'topic' }),
    ]);

    const [result] = applySchemaToSlots(template, componentList);
    expect(result).toEqual(template.slots[0]);
  });
});
