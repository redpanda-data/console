import { onboardingWizardStore } from 'state/onboarding-wizard-store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { generateDefaultValue, getBuiltInComponents, schemaToConfig } from './schema';
import type { RawFieldSpec } from '../types/schema';

vi.mock('zustand');

describe('generateDefaultValue', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('Critical connection fields for Redpanda components', () => {
    test('should ALWAYS show SASL for Redpanda components even when optional/advanced', () => {
      const spec: RawFieldSpec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        is_optional: true,
        is_advanced: true,
        children: [
          {
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            default: 'none',
          },
        ],
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).mechanism).toBe('SCRAM-SHA-256');
    });

    test('should ALWAYS show consumer_group for Redpanda components even when optional', () => {
      onboardingWizardStore.setUserData({
        username: 'admin',
        saslMechanism: 'SCRAM-SHA-256',
        consumerGroup: 'test-group',
      });

      const spec: RawFieldSpec = {
        name: 'consumer_group',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_optional: true,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka_franz',
      });

      expect(result).toBe('test-group');
    });

    test('should NOT show critical fields for non-Redpanda components when optional/advanced', () => {
      const spec: RawFieldSpec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        is_optional: true,
        is_advanced: true,
        children: [
          {
            name: 'mechanism',
            type: 'string',
            kind: 'scalar',
            default: 'none',
          },
        ],
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'http',
      });

      expect(result).toBeUndefined();
    });
  });

  describe('Explicitly required fields (is_optional: false)', () => {
    test('should ALWAYS show required fields even when advanced', () => {
      const spec: RawFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_optional: false,
        is_advanced: true,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(result).toBe('');
    });

    test('should show required fields with defaults', () => {
      const spec: RawFieldSpec = {
        name: 'required_field',
        type: 'string',
        kind: 'scalar',
        default: 'required-value',
        is_optional: false,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'http',
      });

      expect(result).toBe('required-value');
    });
  });

  describe('showAdvancedFields flag', () => {
    test('should show advanced fields when showAdvancedFields=true', () => {
      const spec: RawFieldSpec = {
        name: 'advanced_option',
        type: 'string',
        kind: 'scalar',
        default: 'advanced-default',
        is_advanced: true,
        is_optional: true,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: true,
        componentName: 'http',
      });

      expect(result).toBe('advanced-default');
    });

    test('should hide advanced fields when showAdvancedFields=false', () => {
      const spec: RawFieldSpec = {
        name: 'advanced_option',
        type: 'string',
        kind: 'scalar',
        default: 'advanced-default',
        is_advanced: true,
        is_optional: true,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'http',
      });

      expect(result).toBeUndefined();
    });

    test('should show all fields when showAdvancedFields=true, even optional ones', () => {
      const spec: RawFieldSpec = {
        name: 'optional_field',
        type: 'string',
        kind: 'scalar',
        default: 'optional-default',
        is_optional: true,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: true,
        componentName: 'http',
      });

      expect(result).toBe('optional-default');
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

    test('should populate consumer_group field for redpanda input components', () => {
      const spec: RawFieldSpec = {
        name: 'consumer_group',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka_franz',
      });

      expect(result).toBe('my-consumer-group');
    });

    test('should populate topic field for redpanda components', () => {
      const spec: RawFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBe('example');
    });

    test('should populate topics array for redpanda components', () => {
      const spec: RawFieldSpec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        default: [],
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toEqual(['example']);
    });

    test('should NOT populate topic for non-redpanda components', () => {
      const spec: RawFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'http',
      });

      expect(result).toBe('');
    });

    test('should use secret syntax for user field with wizard data', () => {
      const spec: RawFieldSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_USER_ADMIN}');
    });

    test('should use secret syntax for password field with wizard data', () => {
      const spec: RawFieldSpec = {
        name: 'password',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_secret: true,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');
    });
  });

  describe('Contextual variables population', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    test('should populate schema_registry.url with REDPANDA_SCHEMA_REGISTRY_URL', () => {
      const spec: RawFieldSpec = {
        name: 'url',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'schema_registry',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${REDPANDA_SCHEMA_REGISTRY_URL}');
    });
  });

  describe('Connection defaults for Redpanda Cloud', () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    test('should default SASL mechanism to SCRAM-SHA-256 for REDPANDA components', () => {
      const spec: RawFieldSpec = {
        name: 'mechanism',
        type: 'string',
        kind: 'scalar',
        default: 'none',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'sasl',
      });

      expect(result).toBe('SCRAM-SHA-256');
    });

    test('should use wizard SASL mechanism when available', () => {
      onboardingWizardStore.setUserData({
        username: 'admin',
        saslMechanism: 'SCRAM-SHA-512',
        consumerGroup: '',
      });

      const spec: RawFieldSpec = {
        name: 'mechanism',
        type: 'string',
        kind: 'scalar',
        default: 'none',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'sasl',
      });

      expect(result).toBe('SCRAM-SHA-512');
    });
  });

  describe('Implicitly required fields (no is_optional, no default)', () => {
    test('should show implicitly required fields with Required comment', () => {
      const spec: RawFieldSpec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        // No is_optional, no default = implicitly required
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBeDefined();
      expect(spec.comment).toBe('Required');
    });

    test('should show seed_brokers with Optional comment (special case)', () => {
      const spec: RawFieldSpec = {
        name: 'seed_brokers',
        type: 'string',
        kind: 'array',
        // No is_optional, no default
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'redpanda',
      });

      expect(result).toBeDefined();
      expect(spec.comment).toBe('Optional');
    });

    test('should show mechanism with Required comment', () => {
      const spec: RawFieldSpec = {
        name: 'mechanism',
        type: 'string',
        kind: 'scalar',
        // No is_optional, no default in our test (real schema has default: 'none')
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
        parentName: 'sasl',
      });

      expect(result).toBe('SCRAM-SHA-256'); // Gets connection default
      expect(spec.comment).toBe('Required');
    });
  });

  describe('SASL object generation', () => {
    beforeEach(() => {
      onboardingWizardStore.setUserData({
        username: 'admin',
        saslMechanism: 'SCRAM-SHA-256',
        consumerGroup: '',
      });
    });

    test('should populate sasl object with mechanism, user, and password when user exists', () => {
      const saslSpec: RawFieldSpec = {
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

      // SASL is critical connection field, so it should be shown for Redpanda components
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
      expect(result.access_token).toBeUndefined(); // Optional advanced field should be hidden
    });

    test('should NOT populate sasl object when user does not exist', () => {
      sessionStorage.clear();

      const saslSpec: RawFieldSpec = {
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

      // Without wizard data, SASL is still a critical field but will be empty
      const result = generateDefaultValue(saslSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      // SASL is critical, so it should show with default mechanism
      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).mechanism).toBe('SCRAM-SHA-256');
    });
  });

  describe('Full integration with real schema components', () => {
    beforeEach(() => {
      onboardingWizardStore.setTopicData({ topicName: 'example' });
      onboardingWizardStore.setUserData({
        username: 'admin',
        saslMechanism: 'SCRAM-SHA-256',
        consumerGroup: '',
      });
    });

    test('kafka output should only show critical fields', () => {
      const builtInComponents = getBuiltInComponents();
      const kafkaOutput = builtInComponents.find((c) => c.name === 'kafka' && c.type === 'output');

      const result = schemaToConfig(kafkaOutput, false, false);
      const config = result?.config as Record<string, any>;
      const outputConfig = config?.output?.kafka;

      expect(outputConfig).toBeDefined();

      // Required fields should be shown
      expect(outputConfig.topic).toBe('example');
      expect(outputConfig.addresses).toBeDefined(); // Implicitly required field

      // Critical connection fields should be shown
      expect(outputConfig.sasl).toBeDefined();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(outputConfig.sasl.user).toBe('${secrets.KAFKA_USER_ADMIN}');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(outputConfig.sasl.password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');

      // Non-critical config objects with non-advanced children will show
      expect(outputConfig.batching).toBeDefined();
      expect(outputConfig.metadata).toBeDefined();
      expect(outputConfig.backoff).toBeDefined();

      // Non-advanced fields will show (even if they have defaults)
      expect(outputConfig.key).toBeDefined();
      expect(outputConfig.partitioner).toBeDefined();
      expect(outputConfig.compression).toBeDefined();

      // Only advanced fields are hidden
      expect(outputConfig.client_id).toBeUndefined();
      expect(outputConfig.rack_id).toBeUndefined();

      // SASL should not have optional advanced fields
      expect(outputConfig.sasl.access_token).toBeUndefined();
      expect(outputConfig.sasl.token_cache).toBeUndefined();
      expect(outputConfig.sasl.token_key).toBeUndefined();
    });

    test('redpanda input should only show critical fields', () => {
      const builtInComponents = getBuiltInComponents();
      const redpandaInput = builtInComponents.find((c) => c.name === 'redpanda' && c.type === 'input');

      const result = schemaToConfig(redpandaInput, false, false);
      const config = result?.config as Record<string, any>;
      const inputConfig = config?.input?.redpanda;

      expect(inputConfig).toBeDefined();

      // Required fields should be shown
      expect(inputConfig.topics).toEqual(['example']);
      expect(inputConfig.seed_brokers).toBeDefined(); // Required field

      // Critical connection fields should be shown
      expect(inputConfig.sasl).toBeDefined();
      expect(Array.isArray(inputConfig.sasl)).toBe(true);
      expect(inputConfig.sasl.length).toBeGreaterThan(0);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(inputConfig.sasl[0].username).toBe('${secrets.KAFKA_USER_ADMIN}');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(inputConfig.sasl[0].password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');

      // Optional/advanced fields should be hidden
      expect(inputConfig.client_id).toBeUndefined();
      expect(inputConfig.metadata_max_age).toBeUndefined();
      expect(inputConfig.request_timeout_overhead).toBeUndefined();
      expect(inputConfig.rack_id).toBeUndefined();
    });

    test('kafka output with showAdvancedFields should show advanced fields', () => {
      const builtInComponents = getBuiltInComponents();
      const kafkaOutput = builtInComponents.find((c) => c.name === 'kafka' && c.type === 'output');

      const result = schemaToConfig(kafkaOutput, false, true);
      const config = result?.config as Record<string, any>;
      const outputConfig = config?.output?.kafka;

      expect(outputConfig).toBeDefined();

      // Critical fields still shown
      expect(outputConfig.topic).toBe('example');
      expect(outputConfig.addresses).toBeDefined();
      expect(outputConfig.sasl).toBeDefined();

      // Advanced fields now shown
      expect(outputConfig.client_id).toBeDefined();
      expect(outputConfig.sasl.access_token).toBeDefined();
      expect(outputConfig.tls).toBeDefined();
    });
  });

  describe('Scanner configuration', () => {
    test('should show scanner fields when showAdvancedFields=true', () => {
      const builtInComponents = getBuiltInComponents();
      const avroScanner = builtInComponents.find((c) => c.name === 'avro' && c.type === 'scanner');

      const result = schemaToConfig(avroScanner, false, true);
      const config = result?.config as Record<string, any>;
      const scannerConfig = config?.avro;

      expect(scannerConfig).toBeDefined();
      // Advanced fields show when showAdvancedFields=true
      expect(scannerConfig.raw_json).toBe(false);
    });

    test('should hide advanced scanner fields when showAdvancedFields=false', () => {
      const builtInComponents = getBuiltInComponents();
      const avroScanner = builtInComponents.find((c) => c.name === 'avro' && c.type === 'scanner');

      const result = schemaToConfig(avroScanner, false, false);
      const config = result?.config as Record<string, any>;
      const scannerConfig = config?.avro;

      expect(scannerConfig).toBeDefined();
      // Advanced fields hidden when showAdvancedFields=false
      expect(Object.keys(scannerConfig as Record<string, unknown>).length).toBe(0);
    });
  });
});
