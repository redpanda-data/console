import { onboardingWizardStore } from 'state/onboarding-wizard-store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { mockComponents } from './__fixtures__/component-schemas';
import { generateDefaultValue, schemaToConfig } from './schema';
import type { RawFieldSpec } from '../types/schema';

vi.mock('zustand');

describe('generateDefaultValue', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('Critical connection fields for Redpanda components', () => {
    test('SASL always shown for Redpanda components (critical field)', () => {
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

    test('critical fields get "Optional" comment even when not optional', () => {
      const spec = {
        name: 'sasl',
        type: 'object',
        kind: 'scalar',
        optional: true,
        comment: undefined,
        children: [],
      };

      generateDefaultValue(spec as unknown as RawFieldSpec, {
        showOptionalFields: false,
        showAdvancedFields: false,
        componentName: 'kafka',
      });

      expect(spec.comment).toBe('Optional');
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
      expect(outputConfig.key).toBeUndefined();
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
});
