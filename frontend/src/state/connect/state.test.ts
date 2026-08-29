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
  errors?: string[];
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
      errors: overrides.errors ?? [],
      visible: true,
    },
    metadata: {},
  };
}

// Creates a ConnectorProperty whose entire value section is null.
// Kafka Connect returns this for deprecated/inapplicable properties,
// e.g. database.out.server.name in Debezium Oracle 3.5.x (LogMiner mode).
function createNullValueProperty(name: string): ConnectorProperty {
  return {
    definition: {
      name,
      type: DataType.String as ConnectorProperty['definition']['type'],
      required: false,
      default_value: null,
      importance: PropertyImportance.High,
      documentation: '',
      width: PropertyWidth.Medium,
      display_name: name,
      dependents: [],
      order: 0,
    },
    value: null,
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

  describe('null value section handling', () => {
    // Regression tests for Debezium Oracle 3.5.x returning "value": null for
    // deprecated XStream properties (e.g. database.out.server.name).

    it('excludes properties with a null value section from initConfig', async () => {
      const properties = [
        createMockProperty({ name: 'topic.prefix', value: 'cdc_oracle' }),
        createNullValueProperty('database.out.server.name'),
      ];

      mockValidateConnectorConfig.mockResolvedValue(createMockValidationResult(properties));

      const store = new ConnectorPropertiesStore('test-cluster', 'io.example.Connector', 'source', undefined);
      await vi.waitFor(() => expect(store.initPending).toBe(false));

      // The null-value property must be absent; the valid one must be present.
      expect(store.propsByName.has('database.out.server.name')).toBe(false);
      expect(store.propsByName.has('topic.prefix')).toBe(true);
    });

    it('does not throw when validate() response contains a null value section', async () => {
      // initConfig: only valid properties
      mockValidateConnectorConfig.mockResolvedValue(
        createMockValidationResult([createMockProperty({ name: 'topic.prefix', value: 'cdc_oracle' })])
      );

      const store = new ConnectorPropertiesStore('test-cluster', 'io.example.Connector', 'source', undefined);
      await vi.waitFor(() => expect(store.initPending).toBe(false));

      // validate(): mix of valid and null-value property
      mockValidateConnectorConfig.mockResolvedValue(
        createMockValidationResult([
          createMockProperty({ name: 'topic.prefix', value: 'cdc_oracle', errors: ['required field'] }),
          createNullValueProperty('database.out.server.name'),
        ])
      );

      await expect(store.validate({ 'topic.prefix': 'cdc_oracle' })).resolves.not.toThrow();

      expect(store.propsByName.has('database.out.server.name')).toBe(false);
      // Errors reported by the validate response should be reflected on the property.
      expect(store.propsByName.get('topic.prefix')?.showErrors).toBe(true);
    });

    it('does not throw when validate() response contains null recommended_values or errors', async () => {
      mockValidateConnectorConfig.mockResolvedValue(
        createMockValidationResult([createMockProperty({ name: 'topic.prefix', value: 'cdc_oracle' })])
      );

      const store = new ConnectorPropertiesStore('test-cluster', 'io.example.Connector', 'source', undefined);
      await vi.waitFor(() => expect(store.initPending).toBe(false));

      // validate(): property with null recommended_values and null errors inside value
      const propertyWithNullFields: ConnectorProperty = {
        definition: {
          name: 'topic.prefix',
          type: DataType.String as ConnectorProperty['definition']['type'],
          required: false,
          default_value: null,
          importance: PropertyImportance.High,
          documentation: '',
          width: PropertyWidth.Medium,
          display_name: 'topic.prefix',
          dependents: [],
          order: 0,
        },
        value: {
          name: 'topic.prefix',
          value: 'cdc_oracle',
          recommended_values: null,
          errors: null,
          visible: true,
        },
        metadata: {},
      };

      mockValidateConnectorConfig.mockResolvedValue(createMockValidationResult([propertyWithNullFields]));

      await expect(store.validate({ 'topic.prefix': 'cdc_oracle' })).resolves.not.toThrow();
    });
  });

  describe('SecretsStore', () => {
    it('filters out secrets with empty values', () => {
      const store = new SecretsStore();

      // Create secrets with various values (simulates PASSWORD fields)
      const passwordSecret = store.getSecret('source.cluster.sasl.password');
      passwordSecret.value = 'my-password';

      const emptySecret = store.getSecret('source.cluster.ssl.truststore.certificates');
      // value remains '' (default)

      const nullSecret = store.getSecret('source.cluster.ssl.keystore.key');
      nullSecret.value = '';

      // Only non-empty secrets should be returned
      const secrets = store.secrets;
      expect(secrets.size).toBe(1);
      expect(secrets.has('source.cluster.sasl.password')).toBe(true);
      expect(secrets.has('source.cluster.ssl.truststore.certificates')).toBe(false);
      expect(secrets.has('source.cluster.ssl.keystore.key')).toBe(false);
    });

    it('returns a new Map each time (safe for async iteration)', () => {
      const store = new SecretsStore();
      const secret = store.getSecret('key');
      secret.value = 'value';

      const map1 = store.secrets;
      const map2 = store.secrets;
      expect(map1).not.toBe(map2);
    });

    it('does not retain previously non-empty secrets that become empty', () => {
      const store = new SecretsStore();
      const secret = store.getSecret('key');

      // First: set non-empty value
      secret.value = 'some-value';
      expect(store.secrets.size).toBe(1);

      // Then: clear the value
      secret.value = '';
      expect(store.secrets.size).toBe(0);
    });
  });
});
