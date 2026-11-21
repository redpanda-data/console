import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { ComponentStatus, FieldSpecSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { rpcnWizardStore } from 'state/rpcn-wizard-store';

import { mockComponents } from './__fixtures__/component-schemas';
import { configRecord, configValue } from './__fixtures__/config-value';
import { groundTruthComponents, groundTruthConfigSchema } from './__fixtures__/ground-truth';
import {
  checkRequired,
  fieldHasOptions,
  generateDefaultValue,
  isComponentField,
  isFormField,
  isObjectGroupField,
  isResourceRefField,
  isScalarArrayField,
  isScalarField,
  SENTINEL_REQUIRED_FIELD,
  schemaToConfig,
} from './schema';
import { enrichComponentsWithConfigSchema } from './schema-enrichment';
import type { ConnectComponentSpec, RawFieldSpec } from '../types/schema';

type FieldFixture = Omit<MessageInitShape<typeof FieldSpecSchema>, '$typeName' | '$unknown' | 'children'> &
  Pick<RawFieldSpec, 'comment' | 'requiredBySchema' | 'secret'> & { children?: FieldFixture[] };
/** Complete partial protobuf fixtures in place so annotation assertions retain object identity. */
function makeFieldSpec(input: FieldFixture): RawFieldSpec {
  const { children, comment, requiredBySchema, secret, ...proto } = input;
  const complete: RawFieldSpec = {
    ...create(FieldSpecSchema, proto),
    children: children?.map(makeFieldSpec),
    comment,
    requiredBySchema,
    secret,
  };
  return Object.assign(input, complete);
}

rs.mock('zustand');

// The kafka output's fields the wizard fills in: required ones and the SASL credentials.
function expectKafkaWizardFields(outputConfig: unknown) {
  // Required fields: topic populated by wizard, addresses is required array → sentinel
  expect(configValue(outputConfig, 'topic')).toBe('example');
  expect(configValue(outputConfig, 'addresses')).toBe(SENTINEL_REQUIRED_FIELD);

  // SASL shown with wizard data
  expect(configValue(outputConfig, 'sasl')).toBeDefined();
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
  expect(configValue(outputConfig, 'sasl', 'user')).toBe('${secrets.KAFKA_USER_ADMIN}');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
  expect(configValue(outputConfig, 'sasl', 'password')).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');
}

// The kafka output's fields left to their defaults: emitted, omitted, or hidden as advanced.
function expectKafkaDefaultedFields(outputConfig: unknown) {
  // Optional fields with real (string-serialized) defaults are emitted with those defaults.
  expect(configValue(outputConfig, 'partitioner')).toBe('fnv1a_hash');
  expect(configValue(outputConfig, 'compression')).toBe('none');
  expect(configValue(outputConfig, 'batching')).toEqual({ count: 0 });
  expect(configValue(outputConfig, 'backoff')).toEqual({ initial_interval: '1s' });

  // Optional fields whose default didn't survive serialization are omitted, not zero-filled.
  expect(configValue(outputConfig, 'key')).toBeUndefined();
  // metadata's only child is a collection under an optional parent → nothing to emit.
  expect(configValue(outputConfig, 'metadata')).toBeUndefined();

  // TLS returns { enabled: true } for Redpanda component
  expect(configValue(outputConfig, 'tls')).toEqual({ enabled: true });

  // Advanced fields hidden
  expect(configValue(outputConfig, 'client_id')).toBeUndefined();
  expect(configValue(outputConfig, 'rack_id')).toBeUndefined();
  expect(configValue(outputConfig, 'sasl', 'access_token')).toBeUndefined();
}

// Fields with an empty-string or non-string default are neither required nor zero-filled.
function expectKafkaInputLostDefaultsOmitted(inputConfig: unknown) {
  expect(configValue(inputConfig, 'consumer_group')).toBeUndefined();
  expect(configValue(inputConfig, 'rack_id')).toBeUndefined();
  expect(configValue(inputConfig, 'checkpoint_limit')).toBeUndefined();
  expect(configValue(inputConfig, 'auto_replay_nacks')).toBeUndefined();
  expect(configValue(inputConfig, 'target_version')).toBeUndefined();
}

describe('generateDefaultValue', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('per-field generation', () => {
    describe('the SASL visibility for Redpanda components', () => {
      test('the SASL shown for Redpanda components when wizard user data exists', () => {
        rpcnWizardStore.setUserData({
          username: 'testuser',
          saslMechanism: 'SCRAM-SHA-256',
          consumerGroup: '',
        });

        const spec = makeFieldSpec({
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
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'kafka',
        });

        expect(result).toBeDefined();
        expect(configRecord(result).mechanism).toBe('SCRAM-SHA-256');

        rpcnWizardStore.setUserData({ username: '', consumerGroup: '' });
      });

      test('the SASL NOT shown for Redpanda components without wizard user data', () => {
        rpcnWizardStore.setUserData({ username: '', consumerGroup: '' });

        const spec = makeFieldSpec({
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
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'kafka',
        });

        expect(result).toBeUndefined();
      });

      test('the SASL NOT shown for non-Redpanda components', () => {
        const spec = makeFieldSpec({
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
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'http',
        });

        expect(result).toBeUndefined();
      });
    });

    describe('field visibility rules', () => {
      test('advanced fields are hidden when showAdvancedFields=false', () => {
        const spec = makeFieldSpec({
          name: 'advanced_field',
          type: 'string',
          kind: 'scalar',
          defaultValue: 'value',
          optional: false,
          advanced: true,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'kafka',
        });

        expect(result).toBeUndefined();
      });

      test('optional non-advanced fields are shown by default', () => {
        const spec = makeFieldSpec({
          name: 'optional_field',
          type: 'string',
          kind: 'scalar',
          defaultValue: 'value',
          optional: true,
          advanced: false,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'http',
        });

        expect(result).toBe('value');
      });

      test('required non-advanced fields are shown', () => {
        const spec = makeFieldSpec({
          name: 'required_field',
          type: 'string',
          kind: 'scalar',
          defaultValue: 'required-value',
          optional: false,
          advanced: false,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'http',
        });

        expect(result).toBe('required-value');
      });
    });

    describe('wizard data population', () => {
      beforeEach(() => {
        rpcnWizardStore.setTopicData({ topicName: 'example' });
        rpcnWizardStore.setUserData({
          username: 'admin',
          saslMechanism: 'SCRAM-SHA-256',
          consumerGroup: 'my-consumer-group',
        });
      });

      test('populates topic field (scalar) from wizard', () => {
        const spec = makeFieldSpec({
          name: 'topic',
          type: 'string',
          kind: 'scalar',
          defaultValue: '',
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });

        expect(result).toBe('example');
      });

      test('populates topics array from wizard', () => {
        const spec = makeFieldSpec({
          name: 'topics',
          type: 'string',
          kind: 'array',
          defaultValue: '',
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });

        expect(result).toEqual(['example']);
      });

      test('topics array field without wizard data returns sentinel for required field', () => {
        rpcnWizardStore.setTopicData({ topicName: undefined });

        const spec = makeFieldSpec({
          name: 'topics',
          type: 'string',
          kind: 'array',
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });

        expect(result).toBe(SENTINEL_REQUIRED_FIELD);
        expect(spec.comment).toBe('Required - string list, must be manually set');
      });

      test('populates user/password fields as secret references in SASL context', () => {
        const userSpec = makeFieldSpec({
          name: 'user',
          type: 'string',
          kind: 'scalar',
          defaultValue: '',
        });

        const result = generateDefaultValue(userSpec, {
          showAdvancedFields: false,
          componentName: 'kafka',
          parentName: 'sasl',
        });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
        expect(result).toBe('${secrets.KAFKA_USER_ADMIN}');
      });

      test('password in non-SASL context (client_certs) does NOT get SASL secret injection', () => {
        const passwordSpec = makeFieldSpec({
          name: 'password',
          type: 'string',
          kind: 'scalar',
          defaultValue: '',
        });

        const result = generateDefaultValue(passwordSpec, {
          showAdvancedFields: false,
          componentName: 'kafka',
          parentName: 'client_certs',
        });

        // Should NOT inject SASL password. Unstamped, an empty-string default is indistinguishable
        // from "required, no default", so degraded mode surfaces the required sentinel.
        expect(result).toBe(SENTINEL_REQUIRED_FIELD);
      });

      test('password in non-SASL context stamped not-required by the schema is omitted', () => {
        const passwordSpec = makeFieldSpec({
          name: 'password',
          type: 'string',
          kind: 'scalar',
          defaultValue: '',
          requiredBySchema: false,
        });

        const result = generateDefaultValue(passwordSpec, {
          showAdvancedFields: false,
          componentName: 'kafka',
          parentName: 'client_certs',
        });

        expect(result).toBeUndefined();
      });
    });

    describe('field-less component roots', () => {
      test('returns {} for a component root with no children so the component key survives (e.g. drop)', () => {
        // Production shape: the config root FieldSpec arrives with name '' and no children.
        const spec = makeFieldSpec({
          name: '',
          type: 'object',
          kind: 'scalar',
          optional: false,
          children: [],
        });

        expect(generateDefaultValue(spec, {})).toEqual({});
      });

      test('still omits an empty non-root object field', () => {
        const spec = makeFieldSpec({
          name: 'metadata',
          type: 'object',
          kind: 'scalar',
          optional: true,
          children: [],
        });

        expect(generateDefaultValue(spec, {})).toBeUndefined();
      });
    });

    describe('comment generation', () => {
      test('required fields get descriptive comment', () => {
        const spec = makeFieldSpec({
          name: 'required_field',
          type: 'string',
          kind: 'scalar',
          optional: false,
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'kafka',
        });

        expect(result).toBe(SENTINEL_REQUIRED_FIELD);
        expect(spec.comment).toBe('Required - string, must be manually set');
      });

      test('required string field with real default does NOT get "Required" comment', () => {
        const spec = makeFieldSpec({
          name: 'interval',
          type: 'string',
          kind: 'scalar',
          defaultValue: '1s',
          optional: false,
          comment: undefined,
        });

        generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'generate',
        });

        expect(spec.comment).toBeUndefined();
      });

      test('required string field with empty default returns sentinel', () => {
        const spec = makeFieldSpec({
          name: 'mapping',
          type: 'string',
          kind: 'scalar',
          defaultValue: '',
          optional: false,
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'generate',
        });

        expect(result).toBe(SENTINEL_REQUIRED_FIELD);
        expect(spec.comment).toBe('Required - string, must be manually set');
      });

      test('required int field with empty-string default does NOT get "Required" comment', () => {
        const spec = makeFieldSpec({
          name: 'batch_size',
          type: 'int',
          kind: 'scalar',
          defaultValue: '',
          optional: false,
          comment: undefined,
        });

        generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'generate',
        });

        expect(spec.comment).toBeUndefined();
      });

      test('required bool field with empty-string default does NOT get "Required" comment', () => {
        const spec = makeFieldSpec({
          name: 'auto_replay_nacks',
          type: 'bool',
          kind: 'scalar',
          defaultValue: '',
          optional: false,
          comment: undefined,
        });

        generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });

        expect(spec.comment).toBeUndefined();
      });
    });
  });

  describe('redpanda and empty defaults', () => {
    describe('smart defaults for Redpanda components', () => {
      beforeEach(() => {
        sessionStorage.clear();
      });

      test('schema registry URL uses contextual variable', () => {
        const spec = makeFieldSpec({
          name: 'url',
          type: 'string',
          kind: 'scalar',
          defaultValue: '',
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'kafka',
          parentName: 'schema_registry',
        });

        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
        expect(result).toBe('${REDPANDA_SCHEMA_REGISTRY_URL}');
      });

      test('the SASL mechanism defaults to SCRAM-SHA-256', () => {
        const spec = makeFieldSpec({
          name: 'mechanism',
          type: 'string',
          kind: 'scalar',
          defaultValue: 'none',
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'kafka',
          parentName: 'sasl',
        });

        expect(result).toBe('SCRAM-SHA-256');
      });

      test('the TLS returns { enabled: true } for Redpanda components', () => {
        const spec = makeFieldSpec({
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
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'kafka',
        });

        // Should return { enabled: true } directly, not recurse into children
        expect(result).toEqual({ enabled: true });
      });

      test('the TLS does NOT return { enabled: true } for non-Redpanda components', () => {
        const spec = makeFieldSpec({
          name: 'tls',
          type: 'object',
          kind: 'scalar',
          optional: true,
          advanced: true,
          children: [{ name: 'enabled', type: 'bool', kind: 'scalar', defaultValue: 'false' }],
        });

        // Non-Redpanda component: TLS is advanced, so hidden
        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'http_client',
        });

        expect(result).toBeUndefined();
      });
    });

    describe('the SASL critical field behavior', () => {
      test('the SASL populates with wizard data (user, password as secrets)', () => {
        rpcnWizardStore.setUserData({
          username: 'admin',
          saslMechanism: 'SCRAM-SHA-256',
          consumerGroup: '',
        });

        const saslSpec = makeFieldSpec({
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
        });

        const result = generateDefaultValue(saslSpec, {
          showAdvancedFields: false,
          componentName: 'kafka',
        });

        expect(result).toBeDefined();
        expect(configRecord(result).mechanism).toBe('SCRAM-SHA-256');
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
        expect(configRecord(result).user).toBe('${secrets.KAFKA_USER_ADMIN}');
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
        expect(configRecord(result).password).toBe('${secrets.KAFKA_PASSWORD_ADMIN}');
      });
    });

    describe('map and empty-default handling', () => {
      test('map field stamped not-required (its {} default was dropped by the proto) is omitted', () => {
        const spec = makeFieldSpec({
          name: 'headers',
          type: 'string',
          kind: 'map',
          defaultValue: '',
          requiredBySchema: false,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'http_client',
        });

        expect(result).toBeUndefined();
      });

      test('required map field without default returns sentinel', () => {
        const spec = makeFieldSpec({
          name: 'metadata',
          type: 'string',
          kind: 'map',
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'http_client',
        });

        expect(result).toBe(SENTINEL_REQUIRED_FIELD);
        expect(spec.comment).toBe('Required - key-value map, must be manually set');
      });

      test('int field with empty-string default is omitted (real default was lost, never zero-fill)', () => {
        const spec = makeFieldSpec({
          name: 'batch_size',
          type: 'int',
          kind: 'scalar',
          defaultValue: '',
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'generate',
        });

        // The proto drops non-string defaults; emitting 0 would override the engine's real default.
        expect(result).toBeUndefined();
      });

      test('bool field with empty-string default is omitted (real default was lost, never zero-fill)', () => {
        const spec = makeFieldSpec({
          name: 'some_flag',
          type: 'bool',
          kind: 'scalar',
          defaultValue: '',
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'http_client',
        });

        // e.g. auto_replay_nacks defaults to true — a zero-filled `false` would flip semantics.
        expect(result).toBeUndefined();
      });
    });
  });

  describe('whole component specs', () => {
    describe('full component integration', () => {
      beforeEach(() => {
        rpcnWizardStore.setTopicData({ topicName: 'example' });
        rpcnWizardStore.setUserData({
          username: 'admin',
          saslMechanism: 'SCRAM-SHA-256',
          consumerGroup: '',
        });
      });

      test('kafka output shows required, optional non-advanced, and critical fields', () => {
        const kafkaOutput = mockComponents.kafkaOutput;

        const result = schemaToConfig(kafkaOutput, false);
        const config: unknown = result?.config;
        const outputConfig = configValue(config, ['output', true], ['kafka', true]);

        expect(outputConfig).toBeDefined();
        expectKafkaWizardFields(outputConfig);
        expectKafkaDefaultedFields(outputConfig);
      });

      test('redpanda input with wizard data populates topics and SASL', () => {
        const redpandaInput = mockComponents.redpandaInput;

        const result = schemaToConfig(redpandaInput, false);
        const config: unknown = result?.config;
        const inputConfig = configValue(config, ['input', true], ['redpanda', true]);

        expect(inputConfig).toBeDefined();
        expect(configValue(inputConfig, 'topics')).toEqual(['example']);
        expect(configValue(inputConfig, 'seed_brokers')).toBeDefined();

        // Optional consumer_group has no serialized default → omitted, engine default applies.
        expect(configValue(inputConfig, 'consumer_group')).toBeUndefined();

        // SASL array format for redpanda components
        expect(Array.isArray(configValue(inputConfig, 'sasl'))).toBe(true);
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal config template string
        expect(configValue(inputConfig, 'sasl', 0, 'username')).toBe('${secrets.KAFKA_USER_ADMIN}');
      });
    });

    describe('non-Redpanda component integration (real schema shapes)', () => {
      beforeEach(() => {
        sessionStorage.clear();
      });

      test('generate input: implicitly required field → sentinel, fields with defaults → values', () => {
        const result = schemaToConfig(mockComponents.generateInput, false);
        const config: unknown = result?.config;
        const inputConfig = configValue(config, ['input', true], ['generate', true]);

        expect(inputConfig).toBeDefined();

        // Pattern 1: implicitly required (no optional, no defaultValue) → sentinel
        expect(configValue(inputConfig, 'mapping')).toBe(SENTINEL_REQUIRED_FIELD);

        // Pattern 3: has default → returns converted default
        expect(configValue(inputConfig, 'interval')).toBe('1s');
        expect(configValue(inputConfig, 'count')).toBe(0);
        expect(configValue(inputConfig, 'batch_size')).toBe(1);
        expect(configValue(inputConfig, 'auto_replay_nacks')).toBe(true);
      });

      test('http_client input: required, optional, and advanced field classification', () => {
        const result = schemaToConfig(mockComponents.httpClientInput, false);
        const config: unknown = result?.config;
        const inputConfig = configValue(config, ['input', true], ['http_client', true]);

        expect(inputConfig).toBeDefined();

        // Pattern 1: implicitly required scalar string → sentinel
        expect(configValue(inputConfig, 'url')).toBe(SENTINEL_REQUIRED_FIELD);

        // Pattern 3: has default → returns default
        expect(configValue(inputConfig, 'verb')).toBe('GET');

        // Pattern 1: implicitly required map (no optional, no default) → sentinel
        expect(configValue(inputConfig, 'headers')).toBe(SENTINEL_REQUIRED_FIELD);

        // Pattern 2: explicitly optional + advanced → hidden
        expect(configValue(inputConfig, 'metadata')).toBeUndefined();

        // Explicitly optional + non-advanced + no default → omitted (engine default applies)
        expect(configValue(inputConfig, 'stream_scanner')).toBeUndefined();
      });

      test('generate input includes label field for input type', () => {
        const result = schemaToConfig(mockComponents.generateInput, false);
        const config: unknown = result?.config;

        expect(configValue(config, ['input', true], ['label', true])).toBe('');
      });

      test('http_client with showAdvancedFields=true still omits valueless optional fields', () => {
        const result = schemaToConfig(mockComponents.httpClientInput, true);
        const config: unknown = result?.config;
        const inputConfig = configValue(config, ['input', true], ['http_client', true]);

        expect(inputConfig).toBeDefined();

        // metadata is an optional map with no serialized default — revealing advanced fields
        // doesn't force an empty value into the config.
        expect(configValue(inputConfig, 'metadata')).toBeUndefined();
      });
    });

    describe('the Redpanda input fields', () => {
      describe('required and defaulted fields', () => {
        test('seed_brokers with empty default returns sentinel for required array', () => {
          const spec = makeFieldSpec({
            name: 'seed_brokers',
            type: 'string',
            kind: 'array',
            comment: undefined,
          });

          const result = generateDefaultValue(spec, {
            showAdvancedFields: false,
            componentName: 'redpanda',
          });

          expect(result).toBe(SENTINEL_REQUIRED_FIELD);
          expect(spec.comment).toBe('Required - string list, must be manually set');
        });

        test('regexp_topics with empty default returns sentinel for required array', () => {
          const spec = makeFieldSpec({
            name: 'regexp_topics',
            type: 'string',
            kind: 'array',
            comment: undefined,
          });

          const result = generateDefaultValue(spec, {
            showAdvancedFields: false,
            componentName: 'redpanda',
          });

          expect(result).toBe(SENTINEL_REQUIRED_FIELD);
          expect(spec.comment).toBe('Required - string list, must be manually set');
        });

        test('auto_replay_nacks defaults to boolean true', () => {
          const spec = makeFieldSpec({
            name: 'auto_replay_nacks',
            type: 'bool',
            kind: 'scalar',
            defaultValue: 'true',
          });

          const result = generateDefaultValue(spec, {
            showAdvancedFields: false,
            componentName: 'redpanda',
          });

          expect(result).toBe(true);
          expect(typeof result).toBe('boolean');
        });

        test('transaction_isolation_level has string default', () => {
          const spec = makeFieldSpec({
            name: 'transaction_isolation_level',
            type: 'string',
            kind: 'scalar',
            defaultValue: 'read_uncommitted',
          });

          const result = generateDefaultValue(spec, {
            showAdvancedFields: false,
            componentName: 'redpanda',
          });

          expect(result).toBe('read_uncommitted');
        });
      });

      describe('label field', () => {
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
          const config: unknown = result?.config;

          expect(configValue(config, ['input', true], ['label', true])).toBe('');
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
          const config: unknown = result?.config;

          expect(configValue(config, ['output', true], ['label', true])).toBe('');
        });
      });

      test('max_in_flight converts string default to number', () => {
        const spec = makeFieldSpec({
          name: 'max_in_flight',
          type: 'int',
          kind: 'scalar',
          defaultValue: '256',
          optional: false,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });

        expect(result).toBe(256);
        expect(typeof result).toBe('number');
      });

      test('optional valueless key field is omitted for ALL components', () => {
        const keySpec = makeFieldSpec({
          name: 'key',
          type: 'string',
          kind: 'scalar',
          defaultValue: '',
          optional: true,
        });

        // Redpanda component
        const redpandaResult = generateDefaultValue(keySpec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });
        expect(redpandaResult).toBeUndefined();

        // Non-Redpanda component — same rule everywhere
        const httpResult = generateDefaultValue(keySpec, {
          showAdvancedFields: false,
          componentName: 'http_client',
        });
        expect(httpResult).toBeUndefined();
      });

      test('optional array field with empty default is omitted, not placeholder-filled', () => {
        const spec = makeFieldSpec({
          name: 'regexp_topics',
          type: 'string',
          kind: 'array',
          defaultValue: '',
          optional: true,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });

        expect(result).toBeUndefined();
      });

      test('auto_replay_nacks with string "true" converts to boolean true (no Required comment)', () => {
        const spec = makeFieldSpec({
          name: 'auto_replay_nacks',
          type: 'bool',
          kind: 'scalar',
          defaultValue: 'true',
          optional: false,
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });

        expect(result).toBe(true);
        expect(typeof result).toBe('boolean');
        // Has a meaningful default ("true" → true), so NOT Required
        expect(spec.comment).toBeUndefined();
      });

      test('max_in_flight with string "256" converts to number 256 (no Required comment)', () => {
        const spec = makeFieldSpec({
          name: 'max_in_flight',
          type: 'int',
          kind: 'scalar',
          defaultValue: '256',
          optional: false,
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
        });

        expect(result).toBe(256);
        expect(typeof result).toBe('number');
        // Has a meaningful default ("256" → 256), so NOT Required
        expect(spec.comment).toBeUndefined();
      });
    });

    describe('ancestor-optional propagation', () => {
      test('redpanda output metadata children are not marked required (parent optional)', () => {
        const result = schemaToConfig(mockComponents.redpandaOutput, false);
        const config: unknown = result?.config;
        const outputConfig = configValue(config, ['output', true], ['redpanda', true]);

        expect(outputConfig).toBeDefined();

        // topic IS required (no optional ancestor, empty string default for string scalar)
        expect(configValue(outputConfig, 'topic')).toBe(SENTINEL_REQUIRED_FIELD);

        // metadata children are NOT required (parent metadata is optional); with no emittable
        // children the whole object is omitted rather than seeded with placeholders.
        expect(configValue(outputConfig, 'metadata')).toBeUndefined();
      });

      test('array field under optional parent is omitted, not sentinel', () => {
        const spec = makeFieldSpec({
          name: 'include_prefixes',
          type: 'string',
          kind: 'array',
          defaultValue: '',
          optional: false,
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'redpanda',
          ancestorOptional: true,
        });

        // Should NOT be sentinel — ancestor is optional; and no placeholder either.
        expect(result).toBeUndefined();
        expect(spec.comment).toBeUndefined();
      });

      test('array field without optional ancestor remains sentinel', () => {
        const spec = makeFieldSpec({
          name: 'addresses',
          type: 'string',
          kind: 'array',
          defaultValue: '',
          optional: false,
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'kafka',
          ancestorOptional: false,
        });

        expect(result).toBe(SENTINEL_REQUIRED_FIELD);
        expect(spec.comment).toBe('Required - string list, must be manually set');
      });

      test('non-string type under non-optional ancestor is not required (proto default loss)', () => {
        const spec = makeFieldSpec({
          name: 'max_retries',
          type: 'int',
          kind: 'scalar',
          defaultValue: '',
          optional: false,
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'test',
        });

        // int with empty default — backend dropped the real default, so not required and omitted
        expect(result).not.toBe(SENTINEL_REQUIRED_FIELD);
        expect(result).toBeUndefined();
      });

      test('redpanda_migrator: non-scalar children of optional parent are not required, scalar grandchildren are', () => {
        const result = schemaToConfig(mockComponents.redpandaMigratorOutput, false);
        const config: unknown = result?.config;
        const outputConfig = configValue(config, ['output', true], ['redpanda_migrator', true]);

        expect(outputConfig).toBeDefined();

        // Top-level: topic and seed_brokers are required
        expect(configValue(outputConfig, 'topic')).toBe(SENTINEL_REQUIRED_FIELD);
        expect(configValue(outputConfig, 'seed_brokers')).toBe(SENTINEL_REQUIRED_FIELD);

        // schema_registry is optional but shown (non-advanced)
        expect(configValue(outputConfig, 'schema_registry')).toBeDefined();

        // url is wizard-populated for redpanda components (contextual variable),
        // so it doesn't reach checkRequired. Test scalar-under-optional via basic_auth.username instead.
        // basic_auth.username: scalar string grandchild through non-optional intermediary → sentinel
        expect(configValue(outputConfig, 'schema_registry', 'basic_auth', 'username')).toBe(SENTINEL_REQUIRED_FIELD);
        expect(configValue(outputConfig, 'schema_registry', 'basic_auth', 'password')).toBe(SENTINEL_REQUIRED_FIELD);

        // metadata.include_prefixes: array child of optional metadata → NOT required
        // (non-scalar kind, proto likely lost the [] default) → nothing to emit, object omitted
        expect(configValue(outputConfig, 'metadata')).toBeUndefined();
      });

      test('grandchild through non-optional intermediary is required (schema_registry → basic_auth → username)', () => {
        const result = schemaToConfig(mockComponents.redpandaMigratorOutput, false);
        const config: unknown = result?.config;
        const outputConfig = configValue(config, ['output', true], ['redpanda_migrator', true]);

        expect(configValue(outputConfig, 'schema_registry')).toBeDefined();
        expect(configValue(outputConfig, 'schema_registry', 'basic_auth')).toBeDefined();

        // basic_auth is NOT optional, so its children follow normal required rules.
        // ancestorOptional does NOT propagate through non-optional basic_auth.
        // username and password are string scalars with empty defaults → sentinel
        expect(configValue(outputConfig, 'schema_registry', 'basic_auth', 'username')).toBe(SENTINEL_REQUIRED_FIELD);
        expect(configValue(outputConfig, 'schema_registry', 'basic_auth', 'password')).toBe(SENTINEL_REQUIRED_FIELD);
      });

      test('scalar field under optional parent is still required (ancestorOptional only suppresses non-scalar)', () => {
        const spec = makeFieldSpec({
          name: 'url',
          type: 'string',
          kind: 'scalar',
          defaultValue: '',
          optional: false,
          comment: undefined,
        });

        const result = generateDefaultValue(spec, {
          showAdvancedFields: false,
          componentName: 'test',
          ancestorOptional: true,
        });

        // Scalar string with empty default is genuinely required, even under optional parent
        expect(result).toBe(SENTINEL_REQUIRED_FIELD);
        expect(spec.comment).toBe('Required - string, must be manually set');
      });
    });
  });
});

describe('checkRequired', () => {
  describe('proto flag heuristics', () => {
    test('explicitly optional field is not required', () => {
      expect(checkRequired(makeFieldSpec({ optional: true, type: 'string', kind: 'scalar' }))).toBe(false);
    });

    test('non-scalar field with optional ancestor is not required (proto lost collection default)', () => {
      expect(checkRequired(makeFieldSpec({ optional: false, type: 'string', kind: 'array' }), true)).toBe(false);
      expect(checkRequired(makeFieldSpec({ optional: false, type: 'string', kind: 'map' }), true)).toBe(false);
    });

    test('scalar field with optional ancestor is still required', () => {
      expect(checkRequired(makeFieldSpec({ optional: false, type: 'string', kind: 'scalar' }), true)).toBe(true);
    });

    test('field with non-empty default is not required', () => {
      expect(
        checkRequired(makeFieldSpec({ optional: false, type: 'string', kind: 'scalar', defaultValue: 'hello' }))
      ).toBe(false);
    });

    test('non-string type is not required (proto drops non-string defaults)', () => {
      expect(checkRequired(makeFieldSpec({ optional: false, type: 'int', kind: 'scalar' }))).toBe(false);
      expect(checkRequired(makeFieldSpec({ optional: false, type: 'bool', kind: 'scalar' }))).toBe(false);
    });

    test('string scalar leaf without default is required', () => {
      expect(checkRequired(makeFieldSpec({ optional: false, type: 'string', kind: 'scalar' }))).toBe(true);
    });

    test('string array leaf without default is required', () => {
      expect(checkRequired(makeFieldSpec({ optional: false, type: 'string', kind: 'array' }))).toBe(true);
    });

    test('string map leaf without default is required', () => {
      expect(checkRequired(makeFieldSpec({ optional: false, type: 'string', kind: 'map' }))).toBe(true);
    });

    test('string field with empty-string default is required in degraded mode (indistinguishable)', () => {
      // Known cost of the fallback: the proto serializes both "no default" and a real "" default as
      // defaultValue: '', so unstamped string fields with a genuine empty default look required.
      expect(checkRequired(makeFieldSpec({ type: 'string', kind: 'map', defaultValue: '' }))).toBe(true);
    });

    test('field with undefined optional and undefined defaultValue is required', () => {
      expect(checkRequired(makeFieldSpec({ type: 'string', kind: 'scalar' }))).toBe(true);
    });
  });
  test('requiredBySchema stamp overrides every proto heuristic', () => {
    // Stamped not-required wins even when the fallback ladder would say required…
    expect(
      checkRequired(makeFieldSpec({ type: 'string', kind: 'scalar', optional: false, requiredBySchema: false }))
    ).toBe(false);
    // …and stamped required wins for non-string scalars the fallback can never flag.
    expect(checkRequired(makeFieldSpec({ type: 'int', kind: 'scalar', optional: false, requiredBySchema: true }))).toBe(
      true
    );
    expect(
      checkRequired(makeFieldSpec({ type: 'bool', kind: 'scalar', optional: false, requiredBySchema: true }))
    ).toBe(true);
  });

  test('deprecated wins over a requiredBySchema stamp', () => {
    expect(
      checkRequired(
        makeFieldSpec({
          type: 'string',
          kind: 'scalar',
          deprecated: true,
          requiredBySchema: true,
        })
      )
    ).toBe(false);
  });

  test('advanced non-scalar field is not required', () => {
    expect(checkRequired(makeFieldSpec({ optional: false, type: 'string', kind: 'array', advanced: true }))).toBe(
      false
    );
  });

  test('object with required child is required', () => {
    const spec = makeFieldSpec({
      optional: false,
      type: 'string',
      kind: 'scalar',
      children: [makeFieldSpec({ optional: false, type: 'string', kind: 'scalar' })],
    });
    expect(checkRequired(spec)).toBe(true);
  });

  test('object with all optional children is not required', () => {
    const spec = makeFieldSpec({
      optional: false,
      type: 'string',
      kind: 'scalar',
      children: [makeFieldSpec({ optional: true, type: 'string', kind: 'scalar' })],
    });
    expect(checkRequired(spec)).toBe(false);
  });
});

describe('field-type predicates', () => {
  const field = (partial: FieldFixture): RawFieldSpec => makeFieldSpec({ name: 'f', ...partial });

  test('fieldHasOptions detects enum annotations', () => {
    expect(fieldHasOptions(field({ annotatedOptions: [{ value: 'a' }] }))).toBe(true);
    expect(fieldHasOptions(field({}))).toBe(false);
  });

  test('isScalarField covers primitives, enums, and resource refs', () => {
    expect(isScalarField(field({ type: 'string', kind: 'scalar' }))).toBe(true);
    expect(isScalarField(field({ type: 'int', kind: 'scalar' }))).toBe(true);
    expect(
      isScalarField(
        field({
          type: 'object',
          kind: 'scalar',
          annotatedOptions: [{ value: 'a' }],
        })
      )
    ).toBe(true);
    expect(isScalarField(field({ type: 'cache', kind: 'scalar' }))).toBe(true); // resource ref
    // A nested object (children) is an object group, not a scalar.
    expect(isScalarField(field({ type: 'object', kind: 'scalar', children: [field({})] }))).toBe(false);
  });

  test('isScalarArrayField is a primitive list without options', () => {
    expect(isScalarArrayField(field({ type: 'string', kind: 'array' }))).toBe(true);
    expect(isScalarArrayField(field({ type: 'string', kind: 'scalar' }))).toBe(false);
    expect(isScalarArrayField(field({ type: 'string', kind: 'array', annotatedOptions: [{ value: 'a' }] }))).toBe(
      false
    );
  });

  test('isObjectGroupField is a scalar with children', () => {
    expect(isObjectGroupField(field({ type: 'object', kind: 'scalar', children: [field({})] }))).toBe(true);
    expect(isObjectGroupField(field({ type: 'string', kind: 'scalar' }))).toBe(false);
    // benthos leaves kind empty on some object nodes (e.g. kafka batching) — still an object group.
    expect(isObjectGroupField(field({ type: 'object', kind: '', children: [field({})] }))).toBe(true);
    expect(isObjectGroupField(field({ type: 'string', kind: '', children: [field({})] }))).toBe(false);
  });

  test('isResourceRefField is a childless cache/rate_limit scalar', () => {
    expect(isResourceRefField(field({ type: 'cache', kind: 'scalar' }))).toBe(true);
    expect(isResourceRefField(field({ type: 'rate_limit', kind: 'scalar' }))).toBe(true);
    expect(isResourceRefField(field({ type: 'cache', kind: 'scalar', children: [field({})] }))).toBe(false);
    expect(isResourceRefField(field({ type: 'input', kind: 'scalar' }))).toBe(false);
  });

  test('isComponentField is a nested component, not a resource ref', () => {
    expect(isComponentField(field({ type: 'input', kind: 'scalar' }))).toBe(true);
    expect(isComponentField(field({ type: 'processor', kind: 'array' }))).toBe(true);
    // A cache scalar is a resource reference, not an inline component.
    expect(isComponentField(field({ type: 'cache', kind: 'scalar' }))).toBe(false);
  });

  test('isFormField excludes nested components', () => {
    expect(isFormField(field({ type: 'string', kind: 'scalar' }))).toBe(true);
    expect(isFormField(field({ type: 'string', kind: 'array' }))).toBe(true);
    expect(isFormField(field({ type: 'input', kind: 'scalar' }))).toBe(false);
  });
});

// End-to-end against captured wire data: proto-shaped specs enriched with the raw config schema,
// exactly as the pipeline editor assembles them (parseSchema → enrichComponentsWithConfigSchema).
describe('generateDefaultValue with enriched ground-truth specs', () => {
  const enriched = enrichComponentsWithConfigSchema(groundTruthComponents, groundTruthConfigSchema);
  const enrichedComponent = (type: string, name: string): ConnectComponentSpec => {
    const component = enriched.find((c) => c.type === type && c.name === name);
    if (!component) {
      throw new Error(`missing ${type}:${name}`);
    }
    return component;
  };

  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('starter configs', () => {
    test('kafka input starter config marks exactly the schema-required fields', () => {
      const result = schemaToConfig(enrichedComponent('input', 'kafka'), false);
      const config: unknown = result?.config;
      const inputConfig = configValue(config, ['input', true], ['kafka', true]);

      expect(inputConfig).toBeDefined();
      // Ground truth: addresses and topics are kafka's only required fields.
      expect(configValue(inputConfig, 'addresses')).toBe(SENTINEL_REQUIRED_FIELD);
      expect(configValue(inputConfig, 'topics')).toBe(SENTINEL_REQUIRED_FIELD);

      expectKafkaInputLostDefaultsOmitted(inputConfig);

      // Advanced fields stay hidden; Redpanda connection default keeps TLS on.
      expect(configValue(inputConfig, 'client_id')).toBeUndefined();
      expect(configValue(inputConfig, 'tls')).toEqual({ enabled: true });
    });

    test('generate input keeps its surviving string default and required mapping', () => {
      const result = schemaToConfig(enrichedComponent('input', 'generate'), false);
      const config: unknown = result?.config;
      const inputConfig = configValue(config, ['input', true], ['generate', true]);

      expect(configValue(inputConfig, 'mapping')).toBe(SENTINEL_REQUIRED_FIELD);
      expect(configValue(inputConfig, 'interval')).toBe('1s');
      // Real defaults (count 0, batch_size 1, auto_replay_nacks true) were dropped by the proto —
      // omit them so the engine defaults apply, instead of zero-filling.
      expect(configValue(inputConfig, 'count')).toBeUndefined();
      expect(configValue(inputConfig, 'batch_size')).toBeUndefined();
      expect(configValue(inputConfig, 'auto_replay_nacks')).toBeUndefined();
    });

    test('required non-string scalar is only caught via the schema stamp (chunker.size)', () => {
      const result = schemaToConfig(enrichedComponent('scanner', 'chunker'), false);
      const config: unknown = result?.config;
      expect(configValue(config, ['chunker', true], ['size', true])).toBe(SENTINEL_REQUIRED_FIELD);
    });

    test('deprecated fields are excluded from generated configs even when otherwise required', () => {
      const httpClient = enrichedComponent('input', 'http_client');
      const result = schemaToConfig(httpClient, false);
      const config: unknown = result?.config;
      const stream = configValue(config, ['input', true], ['http_client', true], ['stream', true]);

      // stream.codec (deprecated, has a default) and stream.max_buffer (deprecated, would be
      // stamped required) must both be absent.
      expect(configValue(stream, ['codec', true])).toBeUndefined();
      expect(configValue(stream, ['max_buffer', true])).toBeUndefined();
    });

    test('aws_s3 output requires exactly bucket; object fields with defaulted children are omitted', () => {
      const result = schemaToConfig(enrichedComponent('output', 'aws_s3'), false);
      const config: unknown = result?.config;
      const outputConfig = configValue(config, ['output', true], ['aws_s3', true]);

      // The schema's required array is exactly ["bucket"].
      expect(configValue(outputConfig, 'bucket')).toBe(SENTINEL_REQUIRED_FIELD);
      // metadata/batching have no proto default either, but the schema knows their children are all
      // defaulted — without the stamp the degraded ladder could not tell them apart from bucket.
      expect(configValue(outputConfig, 'metadata')).toBeUndefined();
      expect(configValue(outputConfig, 'batching')).toBeUndefined();
      expect(configValue(outputConfig, 'path')).not.toBe(SENTINEL_REQUIRED_FIELD);
    });
  });

  describe('component roots', () => {
    test('mapping processor root scalar config becomes a required sentinel', () => {
      // The root config node is never stamped (enrichment stamps children), so this exercises the
      // degraded ladder: string scalar, no default, not optional → required.
      const result = schemaToConfig(enrichedComponent('processor', 'mapping'), false);
      const config: unknown = result?.config;
      expect(configValue(config, ['pipeline', true], ['processors', true])).toEqual([
        { mapping: SENTINEL_REQUIRED_FIELD },
      ]);
    });

    test('root array-of-objects config (switch-like) always yields an array, never undefined', () => {
      // A component whose root config is an array of objects (switch, group_by) can never be
      // "required" — the root is never stamped and the proto ladder returns false for non-strings —
      // but inserting it must still emit a type-correct value (`[]`/`[{…}]`), not YAML null.
      const switchLike: ConnectComponentSpec = {
        name: 'switch',
        type: 'processor',
        status: ComponentStatus.STABLE,
        summary: '',
        description: '',
        categories: [],
        version: '',
        examples: [],
        footnotes: '',
        $typeName: 'redpanda.api.dataplane.v1.ComponentSpec',
        config: create(FieldSpecSchema, {
          name: '',
          type: 'object',
          kind: 'array',
          children: [
            // All case fields optional/defaulted (as enrichment stamps the real switch), so the
            // seeded object is empty and the root collapses to [].
            { name: 'check', type: 'string', kind: 'scalar', optional: true },
            { name: 'fallthrough', type: 'bool', kind: 'scalar', defaultValue: '' },
          ],
        }),
      };
      const result = schemaToConfig(switchLike, false);
      const config: unknown = result?.config;
      expect(configValue(config, ['pipeline', true], ['processors', true])).toEqual([{ switch: [] }]);
    });

    test('root array-of-objects config seeds a scaffold object when a case field is required', () => {
      const withRequiredChild: ConnectComponentSpec = {
        name: 'switch_like',
        type: 'processor',
        status: ComponentStatus.STABLE,
        summary: '',
        description: '',
        categories: [],
        version: '',
        examples: [],
        footnotes: '',
        $typeName: 'redpanda.api.dataplane.v1.ComponentSpec',
        config: create(FieldSpecSchema, {
          name: '',
          type: 'object',
          kind: 'array',
          children: [{ name: 'condition', type: 'string', kind: 'scalar' }],
        }),
      };
      const result = schemaToConfig(withRequiredChild, false);
      const config: unknown = result?.config;
      expect(configValue(config, ['pipeline', true], ['processors', true])).toEqual([
        { switch_like: [{ condition: SENTINEL_REQUIRED_FIELD }] },
      ]);
    });
  });
});
