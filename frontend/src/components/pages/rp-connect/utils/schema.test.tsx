import { create } from '@bufbuild/protobuf';
import { ComponentStatus, FieldSpecSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { onboardingWizardStore } from 'state/onboarding-wizard-store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { mockComponents } from './__fixtures__/component-schemas';
import { generateDefaultValue, SENTINEL_REQUIRED_FIELD, schemaToConfig } from './schema';
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';

vi.mock('zustand');

describe('generateDefaultValue', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('SASL visibility for Redpanda components', () => {
    test('SASL shown for Redpanda components when wizard user data exists', () => {
      onboardingWizardStore.setUserData({
        username: 'testuser',
        saslMechanism: 'SCRAM-SHA-256',
        consumerGroup: '',
      });

      const spec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: true,
        children: [
          {
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            defaultValue: 'none',
          },
        ],
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).mechanism).toBe('SCRAM-SHA-256');

      onboardingWizardStore.setUserData({ username: '', consumerGroup: '' });
    });

    test('SASL NOT shown for Redpanda components without wizard user data', () => {
      onboardingWizardStore.setUserData({ username: '', consumerGroup: '' });

      const spec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: true,
        children: [
          {
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            defaultValue: 'none',
          },
        ],
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBeUndefined();
    });

    test('SASL NOT shown for non-Redpanda components', () => {
      const spec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: true,
        children: [
          {
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            defaultValue: 'none',
          },
        ],
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'http',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('Field visibility rules', () => {
    test('advanced fields are hidden when showAdvancedFields=false', () => {
      const spec = {
        name: 'advanced_field',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'value',
        optional: false,
        advanced: true,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBeUndefined();
    });

    test('optional non-advanced fields are shown by default', () => {
      const spec = {
        name: 'optional_field',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'value',
        optional: true,
        advanced: false,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'http',
      });

      expect(result).toBe('value');
    });

    test('required non-advanced fields are shown', () => {
      const spec = {
        name: 'required_field',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'required-value',
        optional: false,
        advanced: false,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'http',
      });

      expect(result).toBe('required-value');
    });
  });

  describe('Wizard data population', () => {
    beforeEach(() => {
      onboardingWizardStore.setTopicData({ topicName: 'example' });
      onboardingWizardStore.setUserData({
        username: 'admin',
        saslMechanism: 'SCRAM-SHA-256',
        consumerGroup: 'my-consumer-group',
      });
    });

    test('populates topic field (scalar) from wizard', () => {
      const spec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe('example');
    });

    test('populates topics array from wizard', () => {
      const spec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['example']);
    });

    test('topics array field without wizard data generates array with empty string', () => {
      onboardingWizardStore.setTopicData({ topicName: undefined });

      const spec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['']);
      expect(Array.isArray(result)).toBe(true);
    });

    test('populates user/password fields as secret references in SASL context', () => {
      const userSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
      };

      const result = generateDefaultValue(userSpec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'sasl',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
      expect(result).toBe('${secrets.KAFKA_USER_ADMIN}');
    });

    test('password in non-SASL context (client_certs) does NOT get SASL secret injection', () => {
      const passwordSpec = {
        name: 'password',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
      };

      const result = generateDefaultValue(passwordSpec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'client_certs',
      });

      // Should NOT inject SASL password — just return the default empty string
      expect(result).toBe('');
    });
  });

  describe('Comment generation', () => {
    test('required fields get descriptive comment', () => {
      const spec = {
        name: 'required_field',
        type: 'string',
        kind: 'scalar',
        optional: false,
        comment: undefined,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBe(SENTINEL_REQUIRED_FIELD);
      expect(spec.comment).toBe('Required - string, must be manually set');
    });

    test('required string field with real default does NOT get "Required" comment', () => {
      const spec = {
        name: 'interval',
        type: 'string',
        kind: 'scalar',
        defaultValue: '1s',
        optional: false,
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'generate',
      });

      expect(spec.comment).toBeUndefined();
    });

    test('required string field with empty default returns sentinel', () => {
      const spec = {
        name: 'mapping',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
        optional: false,
        comment: undefined,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'generate',
      });

      expect(result).toBe(SENTINEL_REQUIRED_FIELD);
      expect(spec.comment).toBe('Required - string, must be manually set');
    });

    test('required int field with empty-string default does NOT get "Required" comment', () => {
      const spec = {
        name: 'batch_size',
        type: 'int',
        kind: 'scalar',
        defaultValue: '',
        optional: false,
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'generate',
      });

      expect(spec.comment).toBeUndefined();
    });

    test('required bool field with empty-string default does NOT get "Required" comment', () => {
      const spec = {
        name: 'auto_replay_nacks',
        type: 'bool',
        kind: 'scalar',
        defaultValue: '',
        optional: false,
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(spec.comment).toBeUndefined();
    });
  });

  describe('Smart defaults for Redpanda components', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    test('schema registry URL uses contextual variable', () => {
      const spec = {
        name: 'url',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'schema_registry',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
      expect(result).toBe('${REDPANDA_SCHEMA_REGISTRY_URL}');
    });

    test('SASL mechanism defaults to SCRAM-SHA-256', () => {
      const spec = {
        name: 'mechanism',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'none',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'sasl',
      });

      expect(result).toBe('SCRAM-SHA-256');
    });

    test('TLS returns { enabled: true } for Redpanda components', () => {
      const spec = {
        name: 'tls',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: true,
        children: [
          {
            name: 'enabled',
            type: 'bool',
            kind: 'scalar',
            defaultValue: 'false',
          },
          {
            name: 'client_certs',
            type: 'object',
            kind: 'array',
            optional: true,
            children: [{ name: 'password', type: 'string', kind: 'scalar', defaultValue: '' }],
          },
        ],
      };

      const result = generateDefaultValue(spec as unknown as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      // Should return { enabled: true } directly, not recurse into children
      expect(result).toEqual({ enabled: true });
    });

    test('TLS does NOT return { enabled: true } for non-Redpanda components', () => {
      const spec = {
        name: 'tls',
        type: 'object',
        kind: 'scalar',
        optional: true,
        advanced: true,
        children: [{ name: 'enabled', type: 'bool', kind: 'scalar', defaultValue: 'false' }],
      };

      // Non-Redpanda component: TLS is advanced, so hidden
      const result = generateDefaultValue(spec as unknown as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'http_client',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('SASL critical field behavior', () => {
    test('SASL populates with wizard data (user, password as secrets)', () => {
      onboardingWizardStore.setUserData({
        username: 'admin',
        saslMechanism: 'SCRAM-SHA-256',
        consumerGroup: '',
      });

      const saslSpec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        advanced: true,
        optional: true,
        children: [
          {
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            defaultValue: 'none',
            advanced: true,
          },
          {
            name: 'user',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
            advanced: true,
          },
          {
            name: 'password',
            type: 'string',
            kind: 'scalar',
            defaultValue: '',
            advanced: true,
            secret: true,
          },
        ],
      } as unknown as RawFieldSpec;

      const result = generateDefaultValue(saslSpec, {
        showAdvancedFields: false,
        componentName: 'kafka',
      }) as Record<string, unknown>;

      expect(result).toBeDefined();
      expect(result.mechanism).toBe('SCRAM-SHA-256');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
      expect(result.user).toBe('${secrets.KAFKA_USER_ADMIN}');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
      expect(result.password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');
    });
  });

  describe('Map and empty-default handling', () => {
    test('map field with empty default generates empty object', () => {
      const spec = {
        name: 'headers',
        type: 'string',
        kind: 'map',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'http_client',
      });

      expect(result).toEqual({});
    });

    test('required map field without default returns sentinel', () => {
      const spec = {
        name: 'metadata',
        type: 'string',
        kind: 'map',
      } as unknown as RawFieldSpec;

      const result = generateDefaultValue(spec, {
        showAdvancedFields: false,
        componentName: 'http_client',
      });

      expect(result).toBe(SENTINEL_REQUIRED_FIELD);
      expect(spec.comment).toBe('Required - key-value map, must be manually set');
    });

    test('int field with empty-string default falls through to kind-based generation', () => {
      const spec = {
        name: 'batch_size',
        type: 'int',
        kind: 'scalar',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'generate',
      });

      // Empty string default for int should NOT produce Number("") = 0 from default
      // Instead, falls through to kind-based generation which produces 0
      expect(result).toBe(0);
      expect(typeof result).toBe('number');
    });

    test('bool field with empty-string default falls through to kind-based generation', () => {
      const spec = {
        name: 'some_flag',
        type: 'bool',
        kind: 'scalar',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'http_client',
      });

      // Empty string for bool should NOT produce "" === "true" = false from default
      // Falls through to kind-based generation which produces false
      expect(result).toBe(false);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Full component integration', () => {
    beforeEach(() => {
      onboardingWizardStore.setTopicData({ topicName: 'example' });
      onboardingWizardStore.setUserData({
        username: 'admin',
        saslMechanism: 'SCRAM-SHA-256',
        consumerGroup: '',
      });
    });

    test('kafka output shows required, optional non-advanced, and critical fields', () => {
      const kafkaOutput = mockComponents.kafkaOutput;

      const result = schemaToConfig(kafkaOutput, false);
      const config = result?.config as Record<string, any>;
      const outputConfig = config?.output?.kafka;

      expect(outputConfig).toBeDefined();

      // Required fields: topic populated by wizard, addresses is array with empty-string default
      expect(outputConfig.topic).toBe('example');
      expect(outputConfig.addresses).toEqual(['']);

      // SASL shown with wizard data
      expect(outputConfig.sasl).toBeDefined();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
      expect(outputConfig.sasl.user).toBe('${secrets.KAFKA_USER_ADMIN}');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
      expect(outputConfig.sasl.password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');

      // Optional non-advanced fields now shown (new behavior)
      expect(outputConfig.key).toBe('');
      expect(outputConfig.partitioner).toBe('fnv1a_hash');
      expect(outputConfig.compression).toBe('none');
      expect(outputConfig.batching).toBeDefined();
      expect(outputConfig.metadata).toBeDefined();
      expect(outputConfig.backoff).toBeDefined();

      // TLS returns { enabled: true } for Redpanda component
      expect(outputConfig.tls).toEqual({ enabled: true });

      // Advanced fields hidden
      expect(outputConfig.client_id).toBeUndefined();
      expect(outputConfig.rack_id).toBeUndefined();
      expect(outputConfig.sasl.access_token).toBeUndefined();
    });

    test('redpanda input with wizard data populates topics and SASL', () => {
      const redpandaInput = mockComponents.redpandaInput;

      const result = schemaToConfig(redpandaInput, false);
      const config = result?.config as Record<string, any>;
      const inputConfig = config?.input?.redpanda;

      expect(inputConfig).toBeDefined();
      expect(inputConfig.topics).toEqual(['example']);
      expect(inputConfig.seed_brokers).toBeDefined();

      // Optional non-advanced consumer_group shown
      expect(inputConfig.consumer_group).toBeDefined();

      // SASL array format for redpanda components
      expect(Array.isArray(inputConfig.sasl)).toBe(true);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
      expect(inputConfig.sasl[0].username).toBe('${secrets.KAFKA_USER_ADMIN}');
    });
  });

  describe('Redpanda input fields', () => {
    test('seed_brokers is shown as array for redpanda input', () => {
      const spec = {
        name: 'seed_brokers',
        type: 'string',
        kind: 'array',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['']);
      expect(Array.isArray(result)).toBe(true);
    });

    test('regexp_topics is shown as array for redpanda input', () => {
      const spec = {
        name: 'regexp_topics',
        type: 'string',
        kind: 'array',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['']);
      expect(Array.isArray(result)).toBe(true);
    });

    test('auto_replay_nacks defaults to boolean true', () => {
      const spec = {
        name: 'auto_replay_nacks',
        type: 'bool',
        kind: 'scalar',
        defaultValue: 'true',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
    });

    test('transaction_isolation_level has string default', () => {
      const spec = {
        name: 'transaction_isolation_level',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'read_uncommitted',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe('read_uncommitted');
    });

    test('input config includes label field', () => {
      const mockRedpandaInputComponent: ConnectComponentSpec = {
        name: 'redpanda',
        type: 'input',
        status: ComponentStatus.STABLE,
        summary: 'Test',
        description: '',
        categories: [],
        version: '',
        examples: [],
        footnotes: '',
        $typeName: 'redpanda.api.dataplane.v1.ComponentSpec',
        config: create(FieldSpecSchema, {
          name: 'root',
          type: 'object',
          kind: 'scalar',
          children: [],
        }),
      };

      const result = schemaToConfig(mockRedpandaInputComponent, false);
      const config = result?.config as Record<string, any>;

      expect(config?.input?.label).toBe('');
    });

    test('output config includes label field', () => {
      const mockKafkaOutputComponent: ConnectComponentSpec = {
        name: 'kafka',
        type: 'output',
        status: ComponentStatus.STABLE,
        summary: 'Test',
        description: '',
        categories: [],
        version: '',
        examples: [],
        footnotes: '',
        $typeName: 'redpanda.api.dataplane.v1.ComponentSpec',
        config: create(FieldSpecSchema, {
          name: 'root',
          type: 'object',
          kind: 'scalar',
          children: [],
        }),
      };

      const result = schemaToConfig(mockKafkaOutputComponent, false);
      const config = result?.config as Record<string, any>;

      expect(config?.output?.label).toBe('');
    });

    test('max_in_flight converts string default to number', () => {
      const spec = {
        name: 'max_in_flight',
        type: 'int',
        kind: 'scalar',
        defaultValue: '256',
        optional: false,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe(256);
      expect(typeof result).toBe('number');
    });

    test('optional non-advanced key field shown for ALL components', () => {
      const keySpec = {
        name: 'key',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
        optional: true,
      };

      // Redpanda component
      const redpandaResult = generateDefaultValue(keySpec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });
      expect(redpandaResult).toBe('');

      // Non-Redpanda component — optional non-advanced fields now shown for all
      const httpResult = generateDefaultValue(keySpec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'http_client',
      });
      expect(httpResult).toBe('');
    });

    test('regexp_topics generates array even with empty default', () => {
      const spec = {
        name: 'regexp_topics',
        type: 'string',
        kind: 'array',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['']);
      expect(Array.isArray(result)).toBe(true);
    });

    test('auto_replay_nacks with string "true" converts to boolean true (no Required comment)', () => {
      const spec = {
        name: 'auto_replay_nacks',
        type: 'bool',
        kind: 'scalar',
        defaultValue: 'true',
        optional: false,
        comment: undefined,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
      // Has a meaningful default ("true" → true), so NOT Required
      expect(spec.comment).toBeUndefined();
    });

    test('max_in_flight with string "256" converts to number 256 (no Required comment)', () => {
      const spec = {
        name: 'max_in_flight',
        type: 'int',
        kind: 'scalar',
        defaultValue: '256',
        optional: false,
        comment: undefined,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe(256);
      expect(typeof result).toBe('number');
      // Has a meaningful default ("256" → 256), so NOT Required
      expect(spec.comment).toBeUndefined();
    });
  });
});
