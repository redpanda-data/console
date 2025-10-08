import { beforeEach, describe, expect, test } from 'vitest';
import { CONNECT_WIZARD_TOPIC_KEY, CONNECT_WIZARD_USER_KEY } from '../../../../state/connect/state';
import type { ConnectFieldSpec } from '../types/schema';
import { builtInComponents, configToYaml, generateDefaultValue, mergeConnectConfigs, schemaToConfig } from './schema';

describe('generateDefaultValue', () => {
  beforeEach(() => {
    // Clear session storage before each test
    sessionStorage.clear();
  });

  describe('Optional fields with defaults', () => {
    test('should NOT show optional fields when showOptionalFields=false', () => {
      const spec: ConnectFieldSpec = {
        name: 'client_id',
        type: 'string',
        kind: 'scalar',
        default: 'benthos',
        is_optional: true,
      };

      const result = generateDefaultValue(spec, false);

      expect(result).toBeUndefined();
    });

    test('should show optional fields when showOptionalFields=true', () => {
      const spec: ConnectFieldSpec = {
        name: 'client_id',
        type: 'string',
        kind: 'scalar',
        default: 'benthos',
        is_optional: true,
      };

      const result = generateDefaultValue(spec, true);

      expect(result).toBe('benthos');
    });

    test('should show required fields with defaults even when showOptionalFields=false', () => {
      const spec: ConnectFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_optional: false,
      };

      const result = generateDefaultValue(spec, false);

      expect(result).toBe('');
    });
  });

  describe('Advanced fields', () => {
    test('should NOT show advanced fields when showOptionalFields=false', () => {
      const spec: ConnectFieldSpec = {
        name: 'access_token',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
        is_optional: true,
      };

      const result = generateDefaultValue(spec, false);

      expect(result).toBeUndefined();
    });

    test('should show advanced fields when showOptionalFields=true', () => {
      const spec: ConnectFieldSpec = {
        name: 'access_token',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
        is_optional: true,
      };

      const result = generateDefaultValue(spec, true);

      expect(result).toBe('');
    });
  });

  describe('Wizard data population', () => {
    beforeEach(() => {
      // Set up wizard data in session storage
      sessionStorage.setItem(CONNECT_WIZARD_TOPIC_KEY, JSON.stringify({ topicName: 'example' }));
      sessionStorage.setItem(
        CONNECT_WIZARD_USER_KEY,
        JSON.stringify({ username: 'admin', saslMechanism: 'SCRAM-SHA-256' })
      );
    });

    test('should populate topic field for redpanda components', () => {
      const spec: ConnectFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, false, 'redpanda');

      expect(result).toBe('example');
    });

    test('should populate topics array for redpanda components', () => {
      const spec: ConnectFieldSpec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        default: [],
      };

      const result = generateDefaultValue(spec, false, 'redpanda');

      expect(result).toEqual(['example']);
    });

    test('should NOT populate topic for non-redpanda components', () => {
      const spec: ConnectFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, false, 'http');

      expect(result).toBe('');
    });

    test('should populate topic for redpanda_migrator component', () => {
      const spec: ConnectFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, false, 'redpanda_migrator');

      expect(result).toBe('example');
    });

    test('should populate topics array for redpanda_common component', () => {
      const spec: ConnectFieldSpec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        default: [],
      };

      const result = generateDefaultValue(spec, false, 'redpanda_common');

      expect(result).toEqual(['example']);
    });

    test('should populate user field for redpanda_migrator_offsets component', () => {
      const spec: ConnectFieldSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
      };

      const result = generateDefaultValue(spec, false, 'redpanda_migrator_offsets');

      expect(result).toBe('admin');
    });

    test('should populate user field in sasl object', () => {
      const spec: ConnectFieldSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
      };

      const result = generateDefaultValue(spec, false, 'kafka');

      expect(result).toBe('admin');
    });

    test('should populate password field as empty string', () => {
      const spec: ConnectFieldSpec = {
        name: 'password',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
        is_secret: true,
      };

      const result = generateDefaultValue(spec, false, 'kafka');

      expect(result).toBe('');
    });
  });

  describe('SASL object generation', () => {
    beforeEach(() => {
      sessionStorage.setItem(
        CONNECT_WIZARD_USER_KEY,
        JSON.stringify({ username: 'admin', saslMechanism: 'SCRAM-SHA-256' })
      );
    });

    test('should populate sasl object with mechanism, user, and password when user exists', () => {
      const saslSpec: ConnectFieldSpec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        is_advanced: true,
        is_optional: true,
        children: [
          {
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            default: 'none',
            is_advanced: true,
          },
          {
            name: 'user',
            type: 'string',
            kind: 'scalar',
            default: '',
            is_advanced: true,
          },
          {
            name: 'password',
            type: 'string',
            kind: 'scalar',
            default: '',
            is_advanced: true,
            is_secret: true,
          },
          {
            name: 'access_token',
            type: 'string',
            kind: 'scalar',
            default: '',
            is_advanced: true,
            is_optional: true,
          },
        ],
      };

      const result = generateDefaultValue(saslSpec, false, 'kafka') as Record<string, unknown>;

      expect(result).toBeDefined();
      expect(result.mechanism).toBe('none');
      expect(result.user).toBe('admin');
      expect(result.password).toBe('');
      expect(result.access_token).toBeUndefined(); // Optional advanced field should be hidden
    });

    test('should NOT populate sasl object when user does not exist', () => {
      sessionStorage.clear();

      const saslSpec: ConnectFieldSpec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        is_advanced: true,
        is_optional: true,
        children: [
          {
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            default: 'none',
            is_advanced: true,
          },
        ],
      };

      const result = generateDefaultValue(saslSpec, false, 'kafka');

      expect(result).toBeUndefined();
    });
  });

  describe('Object generation with mixed field types', () => {
    test('should only include required and wizard-relevant fields by default', () => {
      const spec: ConnectFieldSpec = {
        name: 'config',
        type: 'object',
        kind: 'scalar',
        children: [
          {
            name: 'addresses',
            type: 'string',
            kind: 'array',
            default: [],
            is_optional: false, // Required
          },
          {
            name: 'topic',
            type: 'string',
            kind: 'scalar',
            default: '',
            is_optional: false, // Required
          },
          {
            name: 'client_id',
            type: 'string',
            kind: 'scalar',
            default: 'benthos',
            is_optional: true, // Optional - should be hidden
          },
          {
            name: 'timeout',
            type: 'string',
            kind: 'scalar',
            default: '5s',
            is_optional: true, // Optional - should be hidden
          },
        ],
      };

      sessionStorage.setItem(CONNECT_WIZARD_TOPIC_KEY, JSON.stringify({ topicName: 'example' }));

      const result = generateDefaultValue(spec, false, 'kafka') as Record<string, unknown>;

      expect(result.addresses).toEqual([]);
      expect(result.topic).toBe('example'); // Populated from wizard
      expect(result.client_id).toBeUndefined(); // Optional - hidden
      expect(result.timeout).toBeUndefined(); // Optional - hidden
    });

    test('should NOT show optional nested objects when parent has wizard data', () => {
      // This tests the critical issue: TLS, batching, metadata should NOT be shown
      // just because the parent config has wizard-relevant fields (topic/user)
      const spec: ConnectFieldSpec = {
        name: 'config',
        type: 'object',
        kind: 'scalar',
        children: [
          {
            name: 'topic',
            type: 'string',
            kind: 'scalar',
            default: '',
            is_optional: false,
          },
          {
            name: 'tls',
            type: 'object',
            kind: 'scalar',
            is_optional: true, // Optional - should be HIDDEN
            children: [
              {
                name: 'enabled',
                type: 'bool',
                kind: 'scalar',
                default: false,
              },
              {
                name: 'skip_cert_verify',
                type: 'bool',
                kind: 'scalar',
                default: false,
              },
            ],
          },
          {
            name: 'batching',
            type: 'object',
            kind: 'scalar',
            is_optional: true, // Optional - should be HIDDEN
            children: [
              {
                name: 'count',
                type: 'int',
                kind: 'scalar',
                default: 0,
              },
              {
                name: 'period',
                type: 'string',
                kind: 'scalar',
                default: '',
              },
            ],
          },
        ],
      };

      sessionStorage.setItem(CONNECT_WIZARD_TOPIC_KEY, JSON.stringify({ topicName: 'example' }));

      const result = generateDefaultValue(spec, false, 'kafka') as Record<string, unknown>;

      expect(result.topic).toBe('example');
      expect(result.tls).toBeUndefined(); // Should NOT be shown
      expect(result.batching).toBeUndefined(); // Should NOT be shown
    });

    test('should hide empty arrays when field is optional', () => {
      const spec: ConnectFieldSpec = {
        name: 'sasl',
        type: 'string',
        kind: 'array',
        is_optional: true,
        default: [],
      };

      const result = generateDefaultValue(spec, false, 'redpanda');

      // Empty array for optional field should be undefined
      expect(result).toBeUndefined();
    });

    test('should hide objects with only default values when field is optional', () => {
      const spec: ConnectFieldSpec = {
        name: 'metadata',
        type: 'object',
        kind: 'scalar',
        is_optional: true,
        children: [
          {
            name: 'exclude_prefixes',
            type: 'string',
            kind: 'array',
            default: [],
            is_optional: true,
          },
        ],
      };

      const result = generateDefaultValue(spec, false, 'kafka');

      // Optional object with only optional children should be undefined
      expect(result).toBeUndefined();
    });
  });

  describe('Full integration with real schema components', () => {
    beforeEach(() => {
      sessionStorage.setItem(CONNECT_WIZARD_TOPIC_KEY, JSON.stringify({ topicName: 'example' }));
      sessionStorage.setItem(CONNECT_WIZARD_USER_KEY, JSON.stringify({ username: 'admin' }));
    });

    test('TLS field should be hidden when advanced and no wizard data', () => {
      const kafkaOutput = builtInComponents.find((c) => c.name === 'kafka' && c.type === 'output');
      const tlsSpec = kafkaOutput?.config.children?.find((c) => c.name === 'tls');

      expect(tlsSpec).toBeDefined();
      expect(tlsSpec?.is_advanced).toBe(true);
      expect(tlsSpec?.is_optional).toBeUndefined();

      if (tlsSpec) {
        const result = generateDefaultValue(tlsSpec, false, 'kafka', false);
        expect(result).toBeUndefined();
      }
    });

    test('client_id field should be hidden when advanced with default', () => {
      const kafkaOutput = builtInComponents.find((c) => c.name === 'kafka' && c.type === 'output');
      const clientIdSpec = kafkaOutput?.config.children?.find((c) => c.name === 'client_id');

      expect(clientIdSpec).toBeDefined();
      expect(clientIdSpec?.is_advanced).toBe(true);
      expect(clientIdSpec?.default).toBe('benthos');

      if (clientIdSpec) {
        const result = generateDefaultValue(clientIdSpec, false, 'kafka', false);
        expect(result).toBeUndefined();
      }
    });

    test('kafka output should only show critical fields', () => {
      const kafkaOutput = builtInComponents.find((c) => c.name === 'kafka' && c.type === 'output');

      const config = schemaToConfig(kafkaOutput, false);
      const outputConfig = config?.output?.kafka;

      expect(outputConfig).toBeDefined();
      expect(outputConfig.topic).toBe('example');
      expect(outputConfig.addresses).toEqual([]);

      // Should have sasl with user
      expect(outputConfig.sasl).toBeDefined();
      expect(outputConfig.sasl.user).toBe('admin');
      expect(outputConfig.sasl.password).toBe('');

      // Should NOT have these fields
      expect(outputConfig.tls).toBeUndefined();
      expect(outputConfig.batching).toBeUndefined();
      expect(outputConfig.metadata).toBeUndefined();
      expect(outputConfig.backoff).toBeUndefined();
      expect(outputConfig.client_id).toBeUndefined();
      expect(outputConfig.rack_id).toBeUndefined();
      expect(outputConfig.key).toBeUndefined();
      expect(outputConfig.partitioner).toBeUndefined();
      expect(outputConfig.compression).toBeUndefined();

      // SASL should not have optional advanced fields
      expect(outputConfig.sasl.access_token).toBeUndefined();
      expect(outputConfig.sasl.token_cache).toBeUndefined();
      expect(outputConfig.sasl.token_key).toBeUndefined();
    });

    test('redpanda input should only show critical fields', () => {
      const redpandaInput = builtInComponents.find((c) => c.name === 'redpanda' && c.type === 'input');

      const config = schemaToConfig(redpandaInput, false);
      const inputConfig = config?.input?.redpanda;

      expect(inputConfig).toBeDefined();
      expect(inputConfig.topics).toEqual(['example']);
      expect(inputConfig.seed_brokers).toEqual([]);

      // Should have sasl array with username populated (redpanda uses array-based SASL)
      expect(inputConfig.sasl).toBeDefined();
      expect(Array.isArray(inputConfig.sasl)).toBe(true);
      expect(inputConfig.sasl.length).toBeGreaterThan(0);
      expect(inputConfig.sasl[0].username).toBe('admin');
      expect(inputConfig.sasl[0].password).toBe('');

      // Should NOT have these fields
      expect(inputConfig.tls).toBeUndefined();
      expect(inputConfig.client_id).toBeUndefined();
      expect(inputConfig.metadata_max_age).toBeUndefined();
      expect(inputConfig.request_timeout_overhead).toBeUndefined();
      expect(inputConfig.rack_id).toBeUndefined();
    });
  });

  describe('Scanner configuration', () => {
    test('should show scanner fields when showOptionalFields=true', () => {
      const avroScanner = builtInComponents.find((c) => c.name === 'avro' && c.type === 'scanner');

      const config = schemaToConfig(avroScanner, true);
      const scannerConfig = config?.avro;

      expect(scannerConfig).toBeDefined();
      expect(scannerConfig.raw_json).toBe(false); // Advanced field should be shown
    });

    test('should show empty object when showOptionalFields=false', () => {
      const avroScanner = builtInComponents.find((c) => c.name === 'avro' && c.type === 'scanner');

      const config = schemaToConfig(avroScanner, false);
      const scannerConfig = config?.avro;

      expect(scannerConfig).toBeDefined();
      expect(Object.keys(scannerConfig).length).toBe(0); // Empty object when hiding optional fields
    });
  });

  describe('YAML spacing for merged components', () => {
    test('should add newline between root-level items when adding cache', () => {
      const existingYaml = `input:
  stdin:
    codec: lines

output:
  stdout:
    codec: lines`;

      const cacheSpec = builtInComponents.find((c) => c.name === 'memory' && c.type === 'cache');
      if (!cacheSpec) throw new Error('memory cache not found');

      const newConfig = schemaToConfig(cacheSpec, false);
      if (!newConfig) throw new Error('Failed to generate cache config');

      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig, cacheSpec);
      const yamlString = configToYaml(mergedDoc, cacheSpec);

      // Should have newlines between root-level keys
      expect(yamlString).toContain('output:\n  stdout:\n    codec: lines\n\ncache_resources:');
    });

    test('should add newline between root-level items when adding processor', () => {
      const existingYaml = `input:
  stdin:
    codec: lines`;

      const processorSpec = builtInComponents.find((c) => c.name === 'log' && c.type === 'processor');
      if (!processorSpec) throw new Error('log processor not found');

      const newConfig = schemaToConfig(processorSpec, false);
      if (!newConfig) throw new Error('Failed to generate processor config');

      const mergedDoc = mergeConnectConfigs(existingYaml, newConfig, processorSpec);
      const yamlString = configToYaml(mergedDoc, processorSpec);

      // Should have newlines between root-level keys
      expect(yamlString).toContain('input:\n  stdin:\n    codec: lines\n\npipeline:');
    });
  });
});
