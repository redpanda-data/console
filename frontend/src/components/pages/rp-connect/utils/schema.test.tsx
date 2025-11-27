import { create } from '@bufbuild/protobuf';
import { ComponentStatus, FieldSpecSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { onboardingWizardStore } from 'state/onboarding-wizard-store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { mockComponents } from './__fixtures__/component-schemas';
import { generateDefaultValue, schemaToConfig } from './schema';
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';

vi.mock('zustand');

describe('generateDefaultValue', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('Critical connection fields for Redpanda components', () => {
    test('SASL shown for Redpanda components when wizard user data exists', () => {
      // Set wizard user data to make SASL visible
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).mechanism).toBe('SCRAM-SHA-256');

      // Clean up
      onboardingWizardStore.setUserData({ username: '', consumerGroup: '' });
    });

    test('SASL NOT shown for Redpanda components without wizard user data', () => {
      // Ensure no wizard user data
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBeUndefined();
    });

    test('critical fields NOT shown for non-Redpanda components', () => {
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
        showOptionalFields: false,
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBeUndefined();
    });

    test('optional fields are hidden when showOptionalFields=false', () => {
      const spec = {
        name: 'optional_field',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'value',
        optional: true,
        advanced: false,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: true,
        componentName: 'http',
      });

      expect(result).toBeUndefined();
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
        showOptionalFields: false,
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
        showOptionalFields: false,
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['example']);
    });

    test('topics array field without wizard data generates array with empty string', () => {
      // Clear wizard data to test default behavior
      onboardingWizardStore.setTopicData({ topicName: undefined });

      const spec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        defaultValue: '', // Empty default should still generate array structure
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['']); // Array with empty string, not just empty string
      expect(Array.isArray(result)).toBe(true);
    });

    test('populates user/password fields as secret references', () => {
      const userSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
      };

      const result = generateDefaultValue(userSpec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_USER_ADMIN}');
    });
  });

  describe('Comment generation', () => {
    test('required fields get "Required" comment', () => {
      const spec = {
        name: 'required_field',
        type: 'string',
        kind: 'scalar',
        optional: false,
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(spec.comment).toBe('Required');
    });

    test('topics field gets conditional requirement comment', () => {
      const spec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        defaultValue: '',
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(spec.comment).toBe('Required if regexp_topics and regexp_topics_include are not configured');
    });

    test('regexp_topics_include gets conditional requirement comment', () => {
      const spec = {
        name: 'regexp_topics_include',
        type: 'string',
        kind: 'array',
        defaultValue: '',
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(spec.comment).toBe('Required if topics is not configured');
    });

    test('required fields with defaults get "Required (default: ...)" comment', () => {
      const spec = {
        name: 'required_field',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'my-default',
        optional: false,
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(spec.comment).toBe('Required (default: "my-default")');
    });

    test('optional fields get "Optional" comment', () => {
      const spec = {
        name: 'optional_field',
        type: 'string',
        kind: 'scalar',
        optional: true,
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: true,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(spec.comment).toBe('Optional');
    });

    test('optional fields with defaults get "Optional (default: ...)" comment', () => {
      const spec = {
        name: 'optional_field',
        type: 'string',
        kind: 'scalar',
        defaultValue: 'my-default',
        optional: true,
        comment: undefined,
      };

      generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: true,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(spec.comment).toBe('Optional (default: "my-default")');
    });

    test('critical fields get special comments even when optional', () => {
      const spec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        optional: true,
        comment: undefined,
      };

      generateDefaultValue(spec as unknown as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(spec.comment).toBe('Required if regexp_topics and regexp_topics_include are not configured');
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'schema_registry',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'sasl',
      });

      expect(result).toBe('SCRAM-SHA-256');
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      }) as Record<string, unknown>;

      expect(result).toBeDefined();
      expect(result.mechanism).toBe('SCRAM-SHA-256');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result.user).toBe('${secrets.KAFKA_USER_ADMIN}');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result.password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');
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

    test('kafka output shows required and critical fields, hides optional/advanced', () => {
      const kafkaOutput = mockComponents.kafkaOutput;

      const result = schemaToConfig(kafkaOutput, false, false);
      const config = result?.config as Record<string, any>;
      const outputConfig = config?.output?.kafka;

      expect(outputConfig).toBeDefined();

      // Required fields shown
      expect(outputConfig.topic).toBe('example');
      expect(outputConfig.addresses).toBeDefined();

      // Critical connection fields shown with wizard data
      expect(outputConfig.sasl).toBeDefined();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(outputConfig.sasl.user).toBe('${secrets.KAFKA_USER_ADMIN}');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(outputConfig.sasl.password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');

      // Optional and advanced fields hidden
      expect(outputConfig.batching).toBeUndefined();
      // key is now a critical field for all REDPANDA_TOPIC_AND_USER_COMPONENTS (kafka included)
      expect(outputConfig.key).toBe('');
      expect(outputConfig.client_id).toBeUndefined();
      expect(outputConfig.sasl.access_token).toBeUndefined();
    });

    test('redpanda input with wizard data populates topics and SASL', () => {
      const redpandaInput = mockComponents.redpandaInput;

      const result = schemaToConfig(redpandaInput, false, false);
      const config = result?.config as Record<string, any>;
      const inputConfig = config?.input?.redpanda;

      expect(inputConfig).toBeDefined();
      expect(inputConfig.topics).toEqual(['example']);
      expect(inputConfig.seed_brokers).toBeDefined();

      // SASL array format for redpanda components
      expect(Array.isArray(inputConfig.sasl)).toBe(true);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(inputConfig.sasl[0].username).toBe('${secrets.KAFKA_USER_ADMIN}');
    });
  });

  describe('Redpanda input critical fields', () => {
    test('seed_brokers is shown as array for redpanda input', () => {
      const spec = {
        name: 'seed_brokers',
        type: 'string',
        kind: 'array',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['']);
      expect(Array.isArray(result)).toBe(true);
    });

    test('regexp_topics_include is shown as array for redpanda input', () => {
      const spec = {
        name: 'regexp_topics_include',
        type: 'string',
        kind: 'array',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
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
        showOptionalFields: false,
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
        showOptionalFields: false,
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

      const result = schemaToConfig(mockRedpandaInputComponent, false, false);
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

      const result = schemaToConfig(mockKafkaOutputComponent, false, false);
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
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe(256);
      expect(typeof result).toBe('number');
    });

    test('key and partition shown for redpanda output, hidden for non-REDPANDA components', () => {
      const keySpec = {
        name: 'key',
        type: 'string',
        kind: 'scalar',
        defaultValue: '',
        optional: true,
      };

      // Redpanda - should show (REDPANDA_TOPIC_AND_USER_COMPONENTS + critical field)
      const redpandaResult = generateDefaultValue(keySpec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });
      expect(redpandaResult).toBe('');

      // Kafka - should show (REDPANDA_TOPIC_AND_USER_COMPONENTS + critical field)
      const kafkaResult = generateDefaultValue(keySpec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });
      expect(kafkaResult).toBe('');

      // http_client - should be hidden (not in REDPANDA_TOPIC_AND_USER_COMPONENTS)
      const httpResult = generateDefaultValue(keySpec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'http_client',
      });
      expect(httpResult).toBeUndefined();
    });

    test('regexp_topics generates array even with empty default', () => {
      const spec = {
        name: 'regexp_topics',
        type: 'string',
        kind: 'array',
        defaultValue: '',
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['']);
      expect(Array.isArray(result)).toBe(true);
    });

    test('auto_replay_nacks with string "true" converts to boolean true', () => {
      const spec = {
        name: 'auto_replay_nacks',
        type: 'bool',
        kind: 'scalar',
        defaultValue: 'true',
        optional: false,
        comment: undefined,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe(true);
      expect(typeof result).toBe('boolean');
      expect(spec.comment).toBe('Required (default: true)');
    });

    test('max_in_flight with string "256" converts to number 256', () => {
      const spec = {
        name: 'max_in_flight',
        type: 'int',
        kind: 'scalar',
        defaultValue: '256',
        optional: false,
        comment: undefined,
      };

      const result = generateDefaultValue(spec as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe(256);
      expect(typeof result).toBe('number');
      expect(spec.comment).toBe('Required (default: 256)');
    });

    test('critical fields only affect visibility for fields that exist in schema', () => {
      // Mock a component that doesn't have the 'max_in_flight' field in its schema
      const mockComponentWithoutMaxInFlight: ConnectComponentSpec = {
        name: 'http_client',
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
          children: [
            // Only has url field, no max_in_flight
            create(FieldSpecSchema, {
              name: 'url',
              type: 'string',
              kind: 'scalar',
              defaultValue: '',
            }),
          ],
        }),
      };

      const result = schemaToConfig(mockComponentWithoutMaxInFlight, false, false);
      const config = result?.config as Record<string, any>;
      const outputConfig = config?.output?.http_client;

      // Should only have the fields that exist in the schema
      expect(outputConfig?.url).toBe('');
      // max_in_flight should NOT be added even though it's in REDPANDA_CRITICAL_FIELDS
      expect(outputConfig?.max_in_flight).toBeUndefined();
    });
  });
});
