import { onboardingWizardStore } from 'state/onboarding-wizard-store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { generateDefaultValue, getBuiltInComponents, schemaToConfig } from './schema';
import type { RawFieldSpec } from '../types/schema';

vi.mock('zustand');

describe('generateDefaultValue', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('Optional fields with defaults', () => {
    test('should NOT show optional fields when showOptionalFields=false', () => {
      const spec: RawFieldSpec = {
        name: 'client_id',
        type: 'string',
        kind: 'scalar',
        default: 'benthos',
        is_optional: true,
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false });

      expect(result).toBeUndefined();
    });

    test('should show optional fields when showOptionalFields=true', () => {
      const spec: RawFieldSpec = {
        name: 'client_id',
        type: 'string',
        kind: 'scalar',
        default: 'benthos',
        is_optional: true,
      };

      const result = generateDefaultValue(spec, { showOptionalFields: true });

      expect(result).toBe('benthos');
    });

    test('should show required fields with defaults even when showOptionalFields=false', () => {
      const spec: RawFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_optional: false,
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false });

      expect(result).toBe('');
    });
  });

  describe('Advanced fields', () => {
    test('should NOT show advanced fields when showOptionalFields=false', () => {
      const spec: RawFieldSpec = {
        name: 'access_token',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
        is_optional: true,
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false });

      expect(result).toBeUndefined();
    });

    test('should show advanced fields when showOptionalFields=true', () => {
      const spec: RawFieldSpec = {
        name: 'access_token',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
        is_optional: true,
      };

      const result = generateDefaultValue(spec, { showOptionalFields: true });

      expect(result).toBe('');
    });
  });

  describe('Wizard data population', () => {
    beforeEach(() => {
      onboardingWizardStore.setTopicData({ topicName: 'example' });
      onboardingWizardStore.setUserData({ username: 'admin', saslMechanism: 'SCRAM-SHA-256' });
    });

    test('should populate topic field for redpanda components', () => {
      const spec: RawFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'redpanda' });

      expect(result).toBe('example');
    });

    test('should populate topics array for redpanda components', () => {
      const spec: RawFieldSpec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        default: [],
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'redpanda' });

      expect(result).toEqual(['example']);
    });

    test('should NOT populate topic for non-redpanda components', () => {
      const spec: RawFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'http' });

      expect(result).toBe('');
    });

    test('should populate topic for redpanda_migrator component', () => {
      const spec: RawFieldSpec = {
        name: 'topic',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'redpanda_migrator' });

      expect(result).toBe('example');
    });

    test('should populate topics array for redpanda_common component', () => {
      const spec: RawFieldSpec = {
        name: 'topics',
        type: 'string',
        kind: 'array',
        default: [],
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'redpanda_common' });

      expect(result).toEqual(['example']);
    });

    test('should populate user field for redpanda_migrator_offsets component', () => {
      const spec: RawFieldSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        componentName: 'redpanda_migrator_offsets',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_USER_ADMIN}');
    });

    test('should populate user field in sasl object', () => {
      const spec: RawFieldSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_USER_ADMIN}');
    });

    test('should populate password field with secret syntax', () => {
      const spec: RawFieldSpec = {
        name: 'password',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_advanced: true,
        is_secret: true,
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');
    });
  });

  describe('Contextual variables population', () => {
    beforeEach(() => {
      // Clear wizard data to test contextual variable defaults
      sessionStorage.clear();
    });

    test('should populate seed_brokers with REDPANDA_BROKERS for redpanda components', () => {
      const spec: RawFieldSpec = {
        name: 'seed_brokers',
        type: 'string',
        kind: 'array',
        default: [],
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'redpanda' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toEqual(['${REDPANDA_BROKERS}']);
    });

    test('should populate addresses with REDPANDA_BROKERS for kafka components', () => {
      const spec: RawFieldSpec = {
        name: 'addresses',
        type: 'string',
        kind: 'array',
        default: [],
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toEqual(['${REDPANDA_BROKERS}']);
    });

    test('should populate brokers string field with REDPANDA_BROKERS', () => {
      const spec: RawFieldSpec = {
        name: 'brokers',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${REDPANDA_BROKERS}');
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
        componentName: 'kafka',
        parentName: 'schema_registry',
      });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${REDPANDA_SCHEMA_REGISTRY_URL}');
    });

    test('should NOT populate url when parent is not schema_registry', () => {
      const spec: RawFieldSpec = {
        name: 'url',
        type: 'string',
        kind: 'scalar',
        default: 'http://example.com',
        is_optional: false, // Make it required so it's not hidden
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        componentName: 'kafka',
        parentName: 'http',
      });

      expect(result).toBe('http://example.com');
    });

    test('should NOT populate contextual variables for non-REDPANDA_SECRET_COMPONENTS', () => {
      const spec: RawFieldSpec = {
        name: 'seed_brokers',
        type: 'string',
        kind: 'array',
        default: [],
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'http' });

      expect(result).toEqual([]);
    });
  });

  describe('Connection defaults for Redpanda Cloud', () => {
    beforeEach(() => {
      // Clear wizard data to test connection defaults
      sessionStorage.clear();
    });

    test('should set TLS enabled to true for REDPANDA_SECRET_COMPONENTS', () => {
      const spec: RawFieldSpec = {
        name: 'enabled',
        type: 'bool',
        kind: 'scalar',
        default: false,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        componentName: 'kafka',
        parentName: 'tls',
      });

      expect(result).toBe(true);
    });

    test('should NOT set TLS enabled for non-REDPANDA_SECRET_COMPONENTS', () => {
      const spec: RawFieldSpec = {
        name: 'enabled',
        type: 'bool',
        kind: 'scalar',
        default: false,
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        componentName: 'http',
        parentName: 'tls',
      });

      expect(result).toBe(false);
    });

    test('should default SASL mechanism to SCRAM-SHA-256 for REDPANDA_SECRET_COMPONENTS', () => {
      const spec: RawFieldSpec = {
        name: 'mechanism',
        type: 'string',
        kind: 'scalar',
        default: 'none',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        componentName: 'kafka',
        parentName: 'sasl',
      });

      expect(result).toBe('SCRAM-SHA-256');
    });

    test('should use wizard SASL mechanism when available', () => {
      onboardingWizardStore.setUserData({ username: 'admin', saslMechanism: 'SCRAM-SHA-512' });

      const spec: RawFieldSpec = {
        name: 'mechanism',
        type: 'string',
        kind: 'scalar',
        default: 'none',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        componentName: 'kafka',
        parentName: 'sasl',
      });

      expect(result).toBe('SCRAM-SHA-512');
    });

    test('should NOT set mechanism for non-REDPANDA_SECRET_COMPONENTS', () => {
      const spec: RawFieldSpec = {
        name: 'mechanism',
        type: 'string',
        kind: 'scalar',
        default: 'none',
      };

      const result = generateDefaultValue(spec, {
        showOptionalFields: false,
        componentName: 'http',
        parentName: 'sasl',
      });

      expect(result).toBe('none');
    });
  });

  describe('Secrets syntax with wizard data', () => {
    beforeEach(() => {
      onboardingWizardStore.setUserData({ username: 'test-user', saslMechanism: 'SCRAM-SHA-256' });
    });

    test('should use secret syntax for user field with wizard data', () => {
      const spec: RawFieldSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_USER_TEST_USER}');
    });

    test('should use secret syntax for password field with wizard data', () => {
      const spec: RawFieldSpec = {
        name: 'password',
        type: 'string',
        kind: 'scalar',
        default: '',
        is_secret: true,
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_PASSWORD_TEST_USER}');
    });

    test('should use secret syntax for username field with wizard data', () => {
      const spec: RawFieldSpec = {
        name: 'username',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'redpanda' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_USER_TEST_USER}');
    });

    test('should NOT use secret syntax for non-REDPANDA_SECRET_COMPONENTS', () => {
      const spec: RawFieldSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'http' });

      expect(result).toBe('');
    });

    test('should convert username to screaming snake case in secret key', () => {
      onboardingWizardStore.setUserData({ username: 'my-kafka-user', saslMechanism: 'SCRAM-SHA-256' });

      const spec: RawFieldSpec = {
        name: 'user',
        type: 'string',
        kind: 'scalar',
        default: '',
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' });

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result).toBe('${secrets.KAFKA_USER_MY_KAFKA_USER}');
    });
  });

  describe('SASL object generation', () => {
    beforeEach(() => {
      onboardingWizardStore.setUserData({ username: 'admin', saslMechanism: 'SCRAM-SHA-256' });
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

      const result = generateDefaultValue(saslSpec, { showOptionalFields: false, componentName: 'kafka' }) as Record<
        string,
        unknown
      >;

      expect(result).toBeDefined();
      expect(result.mechanism).toBe('SCRAM-SHA-256'); // Now uses wizard saslMechanism
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

      const result = generateDefaultValue(saslSpec, { showOptionalFields: false, componentName: 'kafka' });

      expect(result).toBeUndefined();
    });
  });

  describe('Object generation with mixed field types', () => {
    test('should only include required and wizard-relevant fields by default', () => {
      const spec: RawFieldSpec = {
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

      onboardingWizardStore.setTopicData({ topicName: 'example' });

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' }) as Record<
        string,
        unknown
      >;

      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(result.addresses).toEqual(['${REDPANDA_BROKERS}']); // Now populated with contextual variable
      expect(result.topic).toBe('example'); // Populated from wizard
      expect(result.client_id).toBeUndefined(); // Optional - hidden
      expect(result.timeout).toBeUndefined(); // Optional - hidden
    });

    test('should show TLS for Redpanda components but hide other optional nested objects', () => {
      // TLS is always shown for Redpanda Cloud components (required for cloud connections)
      // But batching, metadata should NOT be shown just because parent has wizard data
      const spec: RawFieldSpec = {
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
            is_optional: true, // Optional but SHOWN for Redpanda components
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

      onboardingWizardStore.setTopicData({ topicName: 'example' });

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' }) as Record<
        string,
        unknown
      >;

      expect(result.topic).toBe('example');
      expect(result.tls).toBeDefined(); // TLS is SHOWN for Redpanda components
      expect(result.tls).toEqual({ enabled: true }); // TLS enabled defaults to true for Redpanda Cloud
      expect(result.batching).toBeUndefined(); // Should NOT be shown
    });

    test('should hide empty arrays when field is optional', () => {
      const spec: RawFieldSpec = {
        name: 'sasl',
        type: 'string',
        kind: 'array',
        is_optional: true,
        default: [],
      };

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'redpanda' });

      expect(result).toBeUndefined();
    });

    test('should hide objects with only default values when field is optional', () => {
      const spec: RawFieldSpec = {
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

      const result = generateDefaultValue(spec, { showOptionalFields: false, componentName: 'kafka' });

      expect(result).toBeUndefined();
    });
  });

  describe('Full integration with real schema components', () => {
    beforeEach(() => {
      onboardingWizardStore.setTopicData({ topicName: 'example' });
      onboardingWizardStore.setUserData({ username: 'admin' });
    });

    test('TLS field should be shown for Redpanda components even when advanced', () => {
      const builtInComponents = getBuiltInComponents();
      const kafkaOutput = builtInComponents.find((c) => c.name === 'kafka' && c.type === 'output');
      const tlsSpec = kafkaOutput?.config?.children?.find((c) => c.name === 'tls');

      expect(tlsSpec).toBeDefined();
      expect(tlsSpec?.is_advanced).toBe(true);
      expect(tlsSpec?.is_optional).toBeUndefined();

      if (tlsSpec) {
        const result = generateDefaultValue(tlsSpec, {
          showOptionalFields: false,
          componentName: 'kafka',
          insideWizardContext: false,
        });
        // TLS is always shown for Redpanda components (required for cloud connections)
        expect(result).toBeDefined();
        expect((result as any).enabled).toBe(true);
      }
    });

    test('client_id field should be hidden when advanced with default', () => {
      const builtInComponents = getBuiltInComponents();
      const kafkaOutput = builtInComponents.find((c) => c.name === 'kafka' && c.type === 'output');
      const clientIdSpec = kafkaOutput?.config?.children?.find((c) => c.name === 'client_id');

      expect(clientIdSpec).toBeDefined();
      expect(clientIdSpec?.is_advanced).toBe(true);
      expect(clientIdSpec?.default).toBe('benthos');

      if (clientIdSpec) {
        const result = generateDefaultValue(clientIdSpec, {
          showOptionalFields: false,
          componentName: 'kafka',
          insideWizardContext: false,
        });
        expect(result).toBeUndefined();
      }
    });

    test('kafka output should only show critical fields', () => {
      const builtInComponents = getBuiltInComponents();
      const kafkaOutput = builtInComponents.find((c) => c.name === 'kafka' && c.type === 'output');

      const result = schemaToConfig(kafkaOutput, false);
      const config = result?.config as Record<string, any>;
      const outputConfig = config?.output?.kafka;

      expect(outputConfig).toBeDefined();
      expect(outputConfig.topic).toBe('example');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(outputConfig.addresses).toEqual(['${REDPANDA_BROKERS}']);

      expect(outputConfig.sasl).toBeDefined();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(outputConfig.sasl.user).toBe('${secrets.KAFKA_USER_ADMIN}');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(outputConfig.sasl.password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');

      // TLS should be shown for Redpanda components (always required for cloud)
      expect(outputConfig.tls).toBeDefined();
      expect(outputConfig.tls.enabled).toBe(true);

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
      const builtInComponents = getBuiltInComponents();
      const redpandaInput = builtInComponents.find((c) => c.name === 'redpanda' && c.type === 'input');

      const result = schemaToConfig(redpandaInput, false);
      const config = result?.config as Record<string, any>;
      const inputConfig = config?.input?.redpanda;

      expect(inputConfig).toBeDefined();
      expect(inputConfig.topics).toEqual(['example']);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(inputConfig.seed_brokers).toEqual(['${REDPANDA_BROKERS}']);

      expect(inputConfig.sasl).toBeDefined();
      expect(Array.isArray(inputConfig.sasl)).toBe(true);
      expect(inputConfig.sasl.length).toBeGreaterThan(0);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(inputConfig.sasl[0].username).toBe('${secrets.KAFKA_USER_ADMIN}');
      // biome-ignore lint/suspicious/noTemplateCurlyInString: This is a literal string for configuration templates, not a TypeScript template literal
      expect(inputConfig.sasl[0].password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');

      // TLS should be shown for Redpanda components (always required for cloud)
      expect(inputConfig.tls).toBeDefined();
      expect(inputConfig.tls.enabled).toBe(true);

      expect(inputConfig.client_id).toBeUndefined();
      expect(inputConfig.metadata_max_age).toBeUndefined();
      expect(inputConfig.request_timeout_overhead).toBeUndefined();
      expect(inputConfig.rack_id).toBeUndefined();
    });
  });

  describe('Scanner configuration', () => {
    test('should show scanner fields when showOptionalFields=true', () => {
      const builtInComponents = getBuiltInComponents();
      const avroScanner = builtInComponents.find((c) => c.name === 'avro' && c.type === 'scanner');

      const result = schemaToConfig(avroScanner, true);
      const config = result?.config as Record<string, any>;
      const scannerConfig = config?.avro;

      expect(scannerConfig).toBeDefined();
      expect(scannerConfig.raw_json).toBe(false); // Advanced field should be shown
    });

    test('should show empty object when showOptionalFields=false', () => {
      const builtInComponents = getBuiltInComponents();
      const avroScanner = builtInComponents.find((c) => c.name === 'avro' && c.type === 'scanner');

      const result = schemaToConfig(avroScanner, false);
      const config = result?.config as Record<string, any>;
      const scannerConfig = config?.avro;

      expect(scannerConfig).toBeDefined();
      expect(Object.keys(scannerConfig as Record<string, unknown>).length).toBe(0); // Empty object when hiding optional fields
    });
  });
});
