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

import { create } from '@bufbuild/protobuf';
import {
  type ComponentList,
  ComponentListSchema,
  type ComponentSpec,
  ComponentSpecSchema,
  ComponentStatus,
  type FieldSpec,
  FieldSpecSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import type { ConnectComponentSpec } from '../../types/schema';

/**
 * Helper to create a FieldSpec for testing
 */
function createField(field: Partial<FieldSpec>): FieldSpec {
  const baseSpec: Record<string, unknown> = {
    name: field.name || '',
    type: field.type || 'string',
    kind: field.kind || 'scalar',
    optional: field.optional !== undefined ? field.optional : false,
    advanced: field.advanced !== undefined ? field.advanced : false,
    deprecated: field.deprecated !== undefined ? field.deprecated : false,
    children: field.children || [],
    description: field.description || '',
    examples: field.examples || [],
  };

  // Only add defaultValue if explicitly provided
  if (field.defaultValue !== undefined) {
    baseSpec.defaultValue = field.defaultValue;
  }

  return create(FieldSpecSchema, baseSpec);
}

/**
 * Kafka Output Component - Most complex component for testing
 */
export const mockKafkaOutput = create(ComponentSpecSchema, {
  name: 'kafka',
  type: 'output',
  status: ComponentStatus.STABLE,
  summary: 'Kafka output for testing',
  description: 'Writes messages to Kafka topics',
  config: createField({
    name: 'root',
    type: 'object',
    kind: 'scalar',
    children: [
      createField({
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
        optional: false,
        description: 'The topic to publish messages to',
      }),
      createField({
        name: 'addresses',
        type: 'string',
        kind: 'array',
        defaultValue: '',
        optional: false,
        description: 'Kafka broker addresses',
      }),
      createField({
        name: 'key',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
        optional: true,
      }),
      createField({
        name: 'partitioner',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'fnv1a_hash',
        optional: true,
      }),
      createField({
        name: 'compression',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'none',
        optional: true,
      }),
      createField({
        name: 'client_id',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'benthos',
        optional: true,
        advanced: true,
      }),
      createField({
        name: 'rack_id',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
        optional: true,
        advanced: true,
      }),
      createField({
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: true,
        children: [
          createField({
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            defaultValue: 'none',
            advanced: true,
          }),
          createField({
            name: 'user',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
            advanced: true,
          }),
          createField({
            name: 'password',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
            advanced: true,
          }),
          createField({
            name: 'access_token',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
            optional: true,
            advanced: true,
          }),
          createField({
            name: 'token_cache',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
            optional: true,
            advanced: true,
          }),
          createField({
            name: 'token_key',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
            optional: true,
            advanced: true,
          }),
        ],
      }),
      createField({
        name: 'tls',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: true,
        children: [
          createField({
            name: 'enabled',
            type: 'bool',
            kind: 'scalar',
            defaultValue: 'false',
          }),
        ],
      }),
      createField({
        name: 'batching',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: false, // Non-advanced config object
        children: [
          createField({
            name: 'count',
            type: 'int',
            kind: 'scalar',
            defaultValue: '0',
            optional: false, // Non-advanced, shows even when showOptionalFields=false
          }),
        ],
      }),
      createField({
        name: 'metadata',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: false, // Non-advanced config object
        children: [
          createField({
            name: 'include_prefixes',
            type: 'string',
            kind: 'array',
            optional: false, // Non-advanced, shows even when showOptionalFields=false
          }),
        ],
      }),
      createField({
        name: 'backoff',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: false, // Non-advanced config object
        children: [
          createField({
            name: 'initial_interval',
            type: 'string',
            kind: 'scalar',
            defaultValue: '1s',
            optional: false, // Non-advanced, shows even when showOptionalFields=false
          }),
        ],
      }),
    ],
  }),
});

/**
 * Redpanda Input Component - Tests SASL array format
 */
export const mockRedpandaInput = create(ComponentSpecSchema, {
  name: 'redpanda',
  type: 'input',
  status: ComponentStatus.STABLE,
  summary: 'Redpanda input for testing',
  description: 'Reads messages from Redpanda topics',
  config: createField({
    name: 'root',
    type: 'object',
    kind: 'scalar',
    children: [
      createField({
        name: 'topics',
        type: 'string',
        kind: 'array',
        defaultValue: '',
        description: 'Topics to consume from',
      }),
      createField({
        name: 'seed_brokers',
        type: 'string',
        kind: 'array',
        defaultValue: '',
        description: 'Seed broker addresses',
      }),
      createField({
        name: 'consumer_group',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
        optional: true,
      }),
      createField({
        name: 'client_id',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'benthos',
        optional: true,
        advanced: true,
      }),
      createField({
        name: 'rack_id',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
        optional: true,
        advanced: true,
      }),
      createField({
        name: 'metadata_max_age',
        type: 'string',
        kind: 'scalar',
        defaultValue: '5m',
        optional: true,
        advanced: true,
      }),
      createField({
        name: 'request_timeout_overhead',
        type: 'string',
        kind: 'scalar',
        defaultValue: '500ms',
        optional: true,
        advanced: true,
      }),
      createField({
        name: 'sasl',
        type: 'object',
        kind: 'array',
        optional: true,
        advanced: true,
        children: [
          createField({
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            defaultValue: 'none',
          }),
          createField({
            name: 'username',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
          }),
          createField({
            name: 'password',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
          }),
        ],
      }),
    ],
  }),
});

/**
 * Memory Cache Component - Simple cache for testing
 */
export const mockMemoryCache = create(ComponentSpecSchema, {
  name: 'memory',
  type: 'cache',
  status: ComponentStatus.STABLE,
  summary: 'Memory cache for testing',
  description: 'In-memory cache',
  config: createField({
    name: 'root',
    type: 'object',
    kind: 'scalar',
    children: [
      createField({
        name: 'ttl',
        type: 'string',
        kind: 'scalar',
        defaultValue: '5m',
        optional: true,
      }),
      createField({
        name: 'init_values',
        type: 'object',
        kind: 'map',
        defaultValue: '',
        optional: true,
      }),
    ],
  }),
});

/**
 * Bloblang Processor - Simple processor for testing
 */
export const mockBloblangProcessor = create(ComponentSpecSchema, {
  name: 'bloblang',
  type: 'processor',
  status: ComponentStatus.STABLE,
  summary: 'Bloblang processor for testing',
  description: 'Bloblang mapping processor',
  config: createField({
    name: 'root',
    type: 'string',
    kind: 'scalar',
    defaultValue: '',
    description: 'Bloblang mapping',
  }),
});

/**
 * Avro Scanner - Has advanced fields to test visibility
 */
export const mockAvroScanner = create(ComponentSpecSchema, {
  name: 'avro',
  type: 'scanner',
  status: ComponentStatus.STABLE,
  summary: 'Avro scanner for testing',
  description: 'Avro format scanner',
  config: createField({
    name: 'root',
    type: 'object',
    kind: 'scalar',
    optional: false,
    defaultValue: '', // Empty string default for objects - will generate object from children
    children: [
      createField({
        name: 'raw_json',
        type: 'bool',
        kind: 'scalar',
        // No defaultValue - will generate boolean false
        advanced: true,
        optional: true,
      }),
    ],
  }),
});

/**
 * Create a mock ComponentList with all test fixtures
 */
export function createMockComponentList(): ComponentList {
  return create(ComponentListSchema, {
    version: '1.0.0',
    inputs: [mockRedpandaInput],
    outputs: [mockKafkaOutput],
    caches: [mockMemoryCache],
    processors: [mockBloblangProcessor],
    scanners: [mockAvroScanner],
    buffers: [],
    rateLimits: [],
    metrics: [],
    tracers: [],
    bloblangFunctions: [],
    bloblangMethods: [],
  });
}

/**
 * Convert ComponentSpec to ConnectComponentSpec for testing
 */
export function mockComponentToConnectSpec(
  component: ComponentSpec,
  type: 'input' | 'output' | 'cache' | 'processor' | 'scanner'
): ConnectComponentSpec {
  return {
    ...component,
    type,
    config: component.config,
  } as ConnectComponentSpec;
}

/**
 * Get mock components organized by type for easy access in tests
 */
export const mockComponents = {
  kafkaOutput: mockComponentToConnectSpec(mockKafkaOutput, 'output'),
  redpandaInput: mockComponentToConnectSpec(mockRedpandaInput, 'input'),
  memoryCache: mockComponentToConnectSpec(mockMemoryCache, 'cache'),
  bloblangProcessor: mockComponentToConnectSpec(mockBloblangProcessor, 'processor'),
  avroScanner: mockComponentToConnectSpec(mockAvroScanner, 'scanner'),
};
