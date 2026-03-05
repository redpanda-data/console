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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConnectorProperty, ConnectorValidationResult } from '../rest-interfaces';
import { DataType, PropertyImportance, PropertyWidth } from '../rest-interfaces';

// Mock the backend-api module before importing the store
vi.mock('../backend-api', () => ({
  api: {
    validateConnectorConfig: vi.fn(),
  },
}));

import { ConnectorPropertiesStore, SecretsStore } from './state';
import { api } from '../backend-api';

function createMockProperty(overrides: {
  name: string;
  type?: string;
  default_value?: string | null;
  custom_default_value?: string;
  value?: string | null;
  required?: boolean;
}): ConnectorProperty {
  return {
    definition: {
      name: overrides.name,
      type: (overrides.type ?? DataType.String) as ConnectorProperty['definition']['type'],
      required: overrides.required ?? false,
      default_value: overrides.default_value ?? null,
      custom_default_value: overrides.custom_default_value,
      importance: PropertyImportance.High,
      documentation: '',
      width: PropertyWidth.Medium,
      display_name: overrides.name,
      dependents: [],
      order: 0,
    },
    value: {
      name: overrides.name,
      value: overrides.value ?? null,
      recommended_values: [],
      errors: [],
      visible: true,
    },
    metadata: {},
  };
}

function createMockValidationResult(properties: ConnectorProperty[]): ConnectorValidationResult {
  return {
    name: 'test-connector',
    configs: properties,
    steps: [
      {
        name: 'Configuration',
        groups: [
          {
            name: 'General',
            config_keys: properties.map((p) => p.definition.name),
          },
        ],
        stepIndex: 0,
      },
    ],
  };
}

describe('ConnectorPropertiesStore', () => {
  const mockValidateConnectorConfig = vi.mocked(api.validateConnectorConfig);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('custom_default_value handling', () => {
    it('applies custom_default_value for new connectors (appliedConfig = undefined)', async () => {
      // Arrange: Property with custom_default_value
      const properties = [
        createMockProperty({
          name: 'flush.lsn.source',
          type: DataType.Boolean,
          default_value: null,
          custom_default_value: 'true',
          value: null,
        }),
      ];

      mockValidateConnectorConfig.mockResolvedValue(createMockValidationResult(properties));

      // Act: Create store with undefined appliedConfig (new connector)
      const store = new ConnectorPropertiesStore(
        'test-cluster',
        'io.example.ConnectorPlugin',
        'source',
        undefined // Key: undefined = new connector
      );

      // Wait for async initialization
      await vi.waitFor(() => expect(store.initPending).toBe(false));

      // Assert: custom_default_value should be applied
      const prop = store.propsByName.get('flush.lsn.source');
      expect(prop).toBeDefined();
      expect(prop?.value).toBe('true');
    });

    it('preserves user config when editing existing connector (appliedConfig provided)', async () => {
      // Arrange: Property with custom_default_value, but user has different value
      const properties = [
        createMockProperty({
          name: 'flush.lsn.source',
          type: DataType.Boolean,
          default_value: null,
          custom_default_value: 'true',
          value: 'false', // User's saved value from validation
        }),
      ];

      mockValidateConnectorConfig.mockResolvedValue(createMockValidationResult(properties));

      // Act: Create store with appliedConfig (editing existing connector)
      const store = new ConnectorPropertiesStore(
        'test-cluster',
        'io.example.ConnectorPlugin',
        'source',
        { 'flush.lsn.source': 'false' } // User's saved configuration
      );

      // Wait for async initialization
      await vi.waitFor(() => expect(store.initPending).toBe(false));

      // Assert: user's value should be preserved, not overwritten by custom_default_value
      const prop = store.propsByName.get('flush.lsn.source');
      expect(prop).toBeDefined();
      expect(prop?.value).toBe(false); // Sanitized to boolean
    });

    it('applies custom_default_value only to properties that have it', async () => {
      // Arrange: Mix of properties with and without custom_default_value
      const properties = [
        createMockProperty({
          name: 'prop.with.custom.default',
          type: DataType.String,
          default_value: 'original-default',
          custom_default_value: 'custom-default',
          value: null,
        }),
        createMockProperty({
          name: 'prop.without.custom.default',
          type: DataType.String,
          default_value: 'original-default',
          // No custom_default_value
          value: null,
        }),
        createMockProperty({
          name: 'prop.with.no.defaults',
          type: DataType.String,
          default_value: null,
          // No custom_default_value
          value: null,
        }),
      ];

      mockValidateConnectorConfig.mockResolvedValue(createMockValidationResult(properties));

      // Act: Create store with undefined appliedConfig (new connector)
      const store = new ConnectorPropertiesStore('test-cluster', 'io.example.ConnectorPlugin', 'source', undefined);

      // Wait for async initialization
      await vi.waitFor(() => expect(store.initPending).toBe(false));

      // Assert: Only prop with custom_default_value gets the custom default
      expect(store.propsByName.get('prop.with.custom.default')?.value).toBe('custom-default');
      expect(store.propsByName.get('prop.without.custom.default')?.value).toBe('original-default');
      expect(store.propsByName.get('prop.with.no.defaults')?.value).toBeNull();
    });

    it('applies custom_default_value for boolean properties correctly', async () => {
      // Arrange: Boolean properties with various custom_default_value settings
      const properties = [
        createMockProperty({
          name: 'bool.custom.true',
          type: DataType.Boolean,
          default_value: null,
          custom_default_value: 'true',
          value: null,
        }),
        createMockProperty({
          name: 'bool.custom.false',
          type: DataType.Boolean,
          default_value: null,
          custom_default_value: 'false',
          value: null,
        }),
      ];

      mockValidateConnectorConfig.mockResolvedValue(createMockValidationResult(properties));

      // Act: Create store with undefined appliedConfig (new connector)
      const store = new ConnectorPropertiesStore('test-cluster', 'io.example.ConnectorPlugin', 'source', undefined);

      // Wait for async initialization
      await vi.waitFor(() => expect(store.initPending).toBe(false));

      // Assert: custom_default_value strings should be applied
      expect(store.propsByName.get('bool.custom.true')?.value).toBe('true');
      expect(store.propsByName.get('bool.custom.false')?.value).toBe('false');
    });
  });
});

describe('Redpanda Connect — SecretsStore', () => {
  let store: SecretsStore;

  beforeEach(() => {
    store = new SecretsStore();
  });

  describe('connector secret initialization', () => {
    it('initializes secret value to empty string, not undefined', () => {
      const secret = store.getSecret('source.cluster.sasl.jaas.config');
      expect(secret.value).toBe('');
      expect(secret.value).not.toBeUndefined();
    });
  });

  describe('secrets getter — UX-933: MM2 connector creation fails on empty secrets', () => {
    it('excludes PASSWORD connector properties the user never filled in', () => {
      // Backend returns all PASSWORD properties for MM2 connector plugin.
      // User only filled in sasl.password but not jaas.config or ssl certs.
      store.getSecret('source.cluster.sasl.password').value = 'my-password';
      store.getSecret('source.cluster.sasl.jaas.config'); // created but never assigned
      store.getSecret('source.cluster.ssl.truststore.certificates'); // created but never assigned

      const secrets = store.secrets;
      expect(secrets.size).toBe(1);
      expect(secrets.has('source.cluster.sasl.password')).toBe(true);
      expect(secrets.has('source.cluster.sasl.jaas.config')).toBe(false);
      expect(secrets.has('source.cluster.ssl.truststore.certificates')).toBe(false);
    });

    it('excludes connector secrets with whitespace-only values', () => {
      store.getSecret('source.cluster.sasl.password').value = '   ';

      expect(store.secrets.size).toBe(0);
    });

    it('excludes connector secrets with empty string values', () => {
      store.getSecret('source.cluster.sasl.password').value = '';

      expect(store.secrets.size).toBe(0);
    });

    it('includes connector secrets that have actual values', () => {
      store.getSecret('source.cluster.sasl.username').value = 'support';
      store.getSecret('source.cluster.sasl.password').value = 'support';
      store.getSecret('source.cluster.sasl.jaas.config').value =
        "org.apache.kafka.common.security.scram.ScramLoginModule required username=support password='support';";

      const secrets = store.secrets;
      expect(secrets.size).toBe(3);
      expect(secrets.has('source.cluster.sasl.username')).toBe(true);
      expect(secrets.has('source.cluster.sasl.password')).toBe(true);
      expect(secrets.has('source.cluster.sasl.jaas.config')).toBe(true);
    });

    it('clears stale connector secret entries between calls', () => {
      // First call: secret has a value
      store.getSecret('source.cluster.sasl.password').value = 'my-password';
      expect(store.secrets.size).toBe(1);

      // User clears the value in the connector form
      store.getSecret('source.cluster.sasl.password').value = '';
      expect(store.secrets.size).toBe(0);
    });

    it('MM2 creation with SASL_PLAINTEXT should not fail on unused SSL properties', () => {
      // UX-933: User creates MirrorSourceConnector with SASL_PLAINTEXT security protocol.
      // Backend returns PASSWORD properties for both SASL and SSL.
      // User fills in SASL credentials but leaves SSL fields empty.
      store.getSecret('source.cluster.sasl.username').value = 'blah';
      store.getSecret('source.cluster.sasl.password').value = 'blah';
      // These SSL properties are returned by backend but irrelevant for SASL_PLAINTEXT:
      store.getSecret('source.cluster.ssl.truststore.certificates');
      store.getSecret('source.cluster.ssl.keystore.key');
      store.getSecret('source.cluster.ssl.keystore.certificate.chain');

      const secrets = store.secrets;
      expect(secrets.has('source.cluster.ssl.truststore.certificates')).toBe(false);
      expect(secrets.has('source.cluster.ssl.keystore.key')).toBe(false);
      expect(secrets.has('source.cluster.ssl.keystore.certificate.chain')).toBe(false);
      expect(secrets.size).toBe(2);
    });
  });

  describe('ids getter', () => {
    it('returns only ids for connector secrets with values', () => {
      const filled = store.getSecret('source.cluster.sasl.password');
      filled.value = 'my-password';
      filled.id = 'secret-123';

      const empty = store.getSecret('source.cluster.ssl.truststore.certificates');
      empty.id = 'secret-456';

      // Empty secret should be filtered out, so its id should not appear
      expect(store.ids).toEqual(['secret-123']);
    });
  });
});
