/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, test } from 'vitest';

import type { SchemaRegistryCreateSchema } from '../../../state/rest-interfaces';

describe('Schema Create - Normalize Parameter', () => {
  test('SchemaRegistryCreateSchema interface should support params.normalize boolean', () => {
    // Test that the interface accepts normalize: true
    const requestWithNormalizeTrue: SchemaRegistryCreateSchema = {
      schema: '{"type": "record", "name": "test", "fields": []}',
      schemaType: 'AVRO',
      references: [],
      params: {
        normalize: true,
      },
    };

    expect(requestWithNormalizeTrue.params?.normalize).toBe(true);
  });

  test('SchemaRegistryCreateSchema should accept normalize: false', () => {
    const requestWithNormalizeFalse: SchemaRegistryCreateSchema = {
      schema: '{"type": "record", "name": "test", "fields": []}',
      schemaType: 'AVRO',
      references: [],
      params: {
        normalize: false,
      },
    };

    expect(requestWithNormalizeFalse.params?.normalize).toBe(false);
  });

  test('SchemaRegistryCreateSchema should allow params to be omitted', () => {
    const requestWithoutParams: SchemaRegistryCreateSchema = {
      schema: '{"type": "record", "name": "test", "fields": []}',
      schemaType: 'AVRO',
      references: [],
    };

    expect(requestWithoutParams.params).toBeUndefined();
  });

  test('SchemaRegistryCreateSchema should serialize correctly with normalize parameter', () => {
    const request: SchemaRegistryCreateSchema = {
      schema: '{"type": "record", "name": "car", "fields": [{"name": "model", "type": "string"}]}',
      schemaType: 'PROTOBUF',
      references: [{ name: 'ref1', subject: 'subject1', version: 1 }],
      params: {
        normalize: true,
      },
    };

    // Test that it serializes correctly to JSON
    const serialized = JSON.stringify(request);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual({
      schema: '{"type": "record", "name": "car", "fields": [{"name": "model", "type": "string"}]}',
      schemaType: 'PROTOBUF',
      references: [{ name: 'ref1', subject: 'subject1', version: 1 }],
      params: {
        normalize: true,
      },
    });
  });

  test('JSON.stringify should include params with normalize in the request body', () => {
    const request: SchemaRegistryCreateSchema = {
      schema: '{"type": "record", "name": "test"}',
      schemaType: 'AVRO',
      references: [],
      params: {
        normalize: true,
      },
    };

    const json = JSON.stringify(request);
    expect(json).toContain('"normalize":true');
    expect(json).toContain('"params"');
  });

  test('JSON.stringify should omit params when not provided', () => {
    const request: SchemaRegistryCreateSchema = {
      schema: '{"type": "record", "name": "test"}',
      schemaType: 'AVRO',
      references: [],
    };

    const json = JSON.stringify(request);
    expect(json).not.toContain('params');
    expect(json).not.toContain('normalize');
  });
});
