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

  test('pre-4.59 schema (no is_optional keys anywhere) is treated as absent', () => {
    const legacySchema = JSON.stringify({
      definitions: { input: { allOf: [{ anyOf: [{ properties: { kafka: { properties: {} } } }] }] } },
    });
    const [result] = enrichComponentsWithConfigSchema([getGroundTruthComponent('input', 'kafka')], legacySchema);
    const addresses = result.config?.children?.find((c) => c.name === 'addresses') as RawFieldSpec;
    expect(addresses.requiredBySchema).toBeUndefined();
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
