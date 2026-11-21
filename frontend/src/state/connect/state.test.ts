import { initialPropertyValue, parsePropertyValue } from '../../types/kafka-connect-properties';
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

import { waitFor } from '@testing-library/dom';

import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { ConnectorProperty, ConnectorValidationResult } from '../../types/kafka-connect';
import { DataType, PropertyImportance, PropertyWidth } from '../../types/kafka-connect';
import { type api, useApiStore } from '../backend-api';

const mockValidateConnectorConfig = spyOn(useApiStore.getState(), 'validateConnectorConfig').mockImplementation(
  mock<typeof api.validateConnectorConfig>()
);

afterAll(() => {
  mockValidateConnectorConfig.mockRestore();
});

const { ConnectClusterStore, ConnectorPropertiesStore, SecretsStore } = await import('./state');

function createMockProperty(overrides: {
  name: string;
  type?: ConnectorProperty['definition']['type'];
  default_value?: string | null;
  custom_default_value?: string;
  value?: string | null;
  required?: boolean;
}): ConnectorProperty {
  return {
    definition: {
      name: overrides.name,
      type: overrides.type ?? DataType.String,
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

// Create secrets with various values (simulates PASSWORD fields)
function secretsStoreWithOneFilledSecret(): InstanceType<typeof SecretsStore> {
  const store = new SecretsStore();
  store.getSecret('source.cluster.sasl.password').value = 'my-password';

  store.getSecret('source.cluster.ssl.truststore.certificates');
  // value remains '' (default)

  store.getSecret('source.cluster.ssl.keystore.key').value = '';
  return store;
}

describe('the ConnectorPropertiesStore', () => {
  beforeEach(() => {
    mock.clearAllMocks();
  });

  describe('custom_default_value handling', () => {
    test('applies custom_default_value for new connectors (appliedConfig = undefined)', async () => {
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
      await waitFor(() => expect(store.initPending).toBe(false));

      // Assert: custom_default_value should be applied
      const prop = store.propsByName.get('flush.lsn.source');
      expect(prop).toBeDefined();
      expect(prop?.value).toBe('true');
    });

    test('preserves user config when editing existing connector (appliedConfig provided)', async () => {
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
      await waitFor(() => expect(store.initPending).toBe(false));

      // Assert: user's value should be preserved, not overwritten by custom_default_value
      const prop = store.propsByName.get('flush.lsn.source');
      expect(prop).toBeDefined();
      expect(prop?.value).toBe(false); // Sanitized to boolean
    });

    test('applies custom_default_value only to properties that have it', async () => {
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
      await waitFor(() => expect(store.initPending).toBe(false));

      // Assert: Only prop with custom_default_value gets the custom default
      expect(store.propsByName.get('prop.with.custom.default')?.value).toBe('custom-default');
      expect(store.propsByName.get('prop.without.custom.default')?.value).toBe('original-default');
      expect(store.propsByName.get('prop.with.no.defaults')?.value).toBeNull();
    });

    test('applies custom_default_value for boolean properties correctly', async () => {
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
      await waitFor(() => expect(store.initPending).toBe(false));

      // Assert: custom_default_value strings should be applied
      expect(store.propsByName.get('bool.custom.true')?.value).toBe('true');
      expect(store.propsByName.get('bool.custom.false')?.value).toBe('false');
    });
  });

  describe('the SecretsStore', () => {
    test('filters out secrets with empty values', () => {
      // Only non-empty secrets should be returned
      const { secrets } = secretsStoreWithOneFilledSecret();
      expect(secrets.size).toBe(1);
      expect(secrets.has('source.cluster.sasl.password')).toBe(true);
      expect(secrets.has('source.cluster.ssl.truststore.certificates')).toBe(false);
      expect(secrets.has('source.cluster.ssl.keystore.key')).toBe(false);
    });

    test('returns a new Map each time (safe for async iteration)', () => {
      const store = new SecretsStore();
      const secret = store.getSecret('key');
      secret.value = 'value';

      const map1 = store.secrets;
      const map2 = store.secrets;
      expect(map1).not.toBe(map2);
    });

    test('does not retain previously non-empty secrets that become empty', () => {
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

describe('the ConnectClusterStore', () => {
  const S3_SINK = 'com.redpanda.kafka.connect.s3.S3SinkConnector';
  const clusterWithS3Sink = () => {
    const store = new ConnectClusterStore('local-connect-cluster');
    store.additionalClusterInfo = {
      clusterName: 'local-connect-cluster',
      host: 'http://connect:8083',
      clusterVersion: '3.9.0',
      plugins: [{ class: S3_SINK, type: 'sink' }],
    };
    return store;
  };

  // `crud` decides whether secret inputs start read-only behind an Edit button.
  test('opens a new connector for creating, so its secrets are editable at once', () => {
    expect(clusterWithS3Sink().getConnector(S3_SINK, null, undefined)?.crud).toBe('create');
  });

  test('opens an existing connector for updating', () => {
    const connector = clusterWithS3Sink().getConnector(S3_SINK, 'orders-to-s3', { 'aws.s3.bucket.name': 'orders' });
    expect(connector?.crud).toBe('update');
  });
});

describe('connector property value boundaries', () => {
  test.each([null, '', 'x', 0, false, true, ['a', 'b']].map((value) => ({ value })))(
    'retains supported values without coercion: %p',
    ({ value }) => {
      expect(parsePropertyValue(value)).toBe(value);
    }
  );

  test.each([undefined, {}, [1], ['a', 1]].map((value) => ({ value })))(
    'rejects values the form cannot represent: %p',
    ({ value }) => {
      expect(() => parsePropertyValue(value)).toThrow(
        'Connector property values must be a scalar, null, or a list of strings.'
      );
    }
  );

  test('keeps numeric defaults and unrecognized boolean text faithful to the API', () => {
    expect(initialPropertyValue(createMockProperty({ name: 'count', type: DataType.Int, default_value: '0' }))).toBe(0);
    expect(
      initialPropertyValue(createMockProperty({ name: 'flag', type: DataType.Boolean, value: 'not-a-boolean' }))
    ).toBe('not-a-boolean');
  });
});
