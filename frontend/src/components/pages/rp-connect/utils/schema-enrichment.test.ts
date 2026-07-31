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

import { getGroundTruthComponent, groundTruthComponents, groundTruthConfigSchema } from './__fixtures__/ground-truth';
import { enrichComponentsWithConfigSchema } from './schema-enrichment';
import type { RawFieldSpec } from '../types/schema';

const enriched = enrichComponentsWithConfigSchema(groundTruthComponents, groundTruthConfigSchema);

function getField(componentType: string, componentName: string, path: string): RawFieldSpec {
  const component = enriched.find((c) => c.type === componentType && c.name === componentName);
  let current: RawFieldSpec | undefined = component?.config as RawFieldSpec | undefined;
  for (const segment of path.split('.')) {
    current = current?.children?.find((c) => c.name === segment);
    if (!current) {
      throw new Error(`field not found: ${componentType}:${componentName} ${path}`);
    }
  }
  return current;
}

describe('enrichComponentsWithConfigSchema', () => {
  test('stamps requiredBySchema=true only on truly required fields (kafka)', () => {
    expect(getField('input', 'kafka', 'addresses').requiredBySchema).toBe(true);
    expect(getField('input', 'kafka', 'topics').requiredBySchema).toBe(true);
  });

  test('fields whose non-string default is dropped by the proto are NOT required', () => {
    // checkpoint_limit defaults to 1024 (int) — the proto serializes defaultValue: ''.
    const checkpointLimit = getField('input', 'kafka', 'checkpoint_limit');
    expect(checkpointLimit.defaultValue).toBe('');
    expect(checkpointLimit.requiredBySchema).toBe(false);
    // auto_replay_nacks defaults to true (bool).
    expect(getField('input', 'kafka', 'auto_replay_nacks').requiredBySchema).toBe(false);
  });

  test('string fields with an empty-string default are NOT required', () => {
    // Indistinguishable from a required field on the proto side; the schema knows better.
    expect(getField('input', 'kafka', 'consumer_group').requiredBySchema).toBe(false);
    expect(getField('input', 'kafka', 'rack_id').requiredBySchema).toBe(false);
  });

  test('required non-string scalars are caught (chunker.size int)', () => {
    expect(getField('scanner', 'chunker', 'size').requiredBySchema).toBe(true);
  });

  test('stamps nested fields through object and object-array wrappers', () => {
    // sasl is an object: its children get their own stamps.
    expect(getField('input', 'kafka', 'sasl.mechanism').requiredBySchema).toBe(false);
    // tls.client_certs is an array of objects: children live under items.properties.
    expect(getField('input', 'kafka', 'tls.client_certs.cert').requiredBySchema).toBe(false);
    expect(getField('input', 'kafka', 'tls.client_certs.password').secret).toBe(true);
  });

  test('stamps is_secret the name heuristic cannot know about', () => {
    expect(getField('input', 'kafka', 'tls.root_cas').secret).toBe(true);
    expect(getField('output', 'aws_s3', 'credentials.secret').secret).toBe(true);
    expect(getField('input', 'kafka', 'addresses').secret).toBe(false);
  });

  test('required object fields propagate (generate.mapping)', () => {
    expect(getField('input', 'generate', 'mapping').requiredBySchema).toBe(true);
    expect(getField('input', 'generate', 'interval').requiredBySchema).toBe(false);
  });

  test('degrades to input untouched without a usable schema', () => {
    const kafka = getGroundTruthComponent('input', 'kafka');
    for (const schema of [undefined, 'not json', '{"definitions": 3}', '{"properties": {}}']) {
      const [result] = enrichComponentsWithConfigSchema([kafka], schema);
      const addresses = result.config?.children?.find((c) => c.name === 'addresses') as RawFieldSpec;
      expect(addresses.requiredBySchema).toBeUndefined();
      expect(addresses.secret).toBeUndefined();
    }
  });

  test('an ancient schema with no required arrays at all is treated as absent', () => {
    // Stamping requiredBySchema=false everywhere from a document that never emitted the arrays
    // would erase genuinely required fields.
    const legacySchema = JSON.stringify({
      definitions: { input: { allOf: [{ anyOf: [{ properties: { kafka: { properties: {} } } }] }] } },
    });
    const [result] = enrichComponentsWithConfigSchema([getGroundTruthComponent('input', 'kafka')], legacySchema);
    const addresses = result.config?.children?.find((c) => c.name === 'addresses') as RawFieldSpec;
    expect(addresses.requiredBySchema).toBeUndefined();
  });

  test('a mid-generation schema (required arrays, no per-field flags) still stamps required-ness', () => {
    // Live dataplanes commonly serve this format: `required` arrays but no is_optional/is_secret.
    // Without stamping, string fields whose "" default was lost in the proto all show as required.
    const withoutFlags = JSON.stringify(JSON.parse(groundTruthConfigSchema), (key, value) =>
      key === 'is_optional' || key === 'is_secret' ? undefined : value
    );
    const [result] = enrichComponentsWithConfigSchema([getGroundTruthComponent('input', 'kafka')], withoutFlags);
    const field = (name: string) => result.config?.children?.find((c) => c.name === name) as RawFieldSpec;
    expect(field('addresses').requiredBySchema).toBe(true);
    expect(field('topics').requiredBySchema).toBe(true);
    // The proto shows an empty default for these; only the required arrays reveal they're optional.
    expect(field('consumer_group').requiredBySchema).toBe(false);
    expect(field('rack_id').requiredBySchema).toBe(false);
  });

  test('components missing from the schema pass through unstamped', () => {
    const custom = { ...getGroundTruthComponent('input', 'kafka'), name: 'not_in_schema' };
    const [result] = enrichComponentsWithConfigSchema([custom], groundTruthConfigSchema);
    const addresses = result.config?.children?.find((c) => c.name === 'addresses') as RawFieldSpec;
    expect(addresses.requiredBySchema).toBeUndefined();
  });

  test('does not mutate its input', () => {
    const kafka = getGroundTruthComponent('input', 'kafka');
    enrichComponentsWithConfigSchema([kafka], groundTruthConfigSchema);
    const addresses = kafka.config?.children?.find((c) => c.name === 'addresses') as RawFieldSpec;
    expect(addresses.requiredBySchema).toBeUndefined();
  });
});

describe('lint-required overrides', () => {
  // Mirrors the production redpanda input: its schema flags every field optional because runtime
  // lints ("either topics or regexp_topics_include must be specified", "a consumer group is
  // mandatory when not using explicit topic partitions") carry the real requirements.
  const redpandaInput = {
    name: 'redpanda',
    type: 'input',
    config: {
      name: '',
      type: 'object',
      kind: 'scalar',
      children: [
        { name: 'topics', type: 'string', kind: 'array', optional: true },
        { name: 'consumer_group', type: 'string', kind: 'scalar', optional: true },
        { name: 'seed_brokers', type: 'string', kind: 'array', optional: true },
      ],
    },
  } as unknown as (typeof groundTruthComponents)[number];

  const fieldOf = (result: (typeof groundTruthComponents)[number], name: string) =>
    result.config?.children?.find((c) => c.name === name) as RawFieldSpec;

  test('stamps the lint-enforced fields required even without a usable schema', () => {
    // The degraded path (no raw schema at all — e.g. older dataplanes) must still apply them.
    const [result] = enrichComponentsWithConfigSchema([redpandaInput], undefined);
    expect(fieldOf(result, 'topics').requiredBySchema).toBe(true);
    expect(fieldOf(result, 'consumer_group').requiredBySchema).toBe(true);
    expect(fieldOf(result, 'seed_brokers').requiredBySchema).toBeUndefined();
  });

  test('wins over schema stamping (the schema calls these fields optional)', () => {
    const [result] = enrichComponentsWithConfigSchema([redpandaInput], groundTruthConfigSchema);
    expect(fieldOf(result, 'topics').requiredBySchema).toBe(true);
    expect(fieldOf(result, 'consumer_group').requiredBySchema).toBe(true);
  });

  test('leaves non-curated components alone', () => {
    const [result] = enrichComponentsWithConfigSchema([getGroundTruthComponent('input', 'kafka')], undefined);
    const topics = result.config?.children?.find((c) => c.name === 'topics') as RawFieldSpec;
    expect(topics.requiredBySchema).toBeUndefined();
  });
});
