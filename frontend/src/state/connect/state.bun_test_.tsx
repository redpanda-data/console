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

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ConnectorProperty, ConnectorValidationResult } from '../rest-interfaces';
import { DataType, PropertyImportance, PropertyWidth } from '../rest-interfaces';

// Create mock function
const mockValidateConnectorConfig = mock(() => Promise.resolve({} as ConnectorValidationResult));

// Mock the backend-api module before importing the store
mock.module('../backend-api', () => ({
  api: {
    validateConnectorConfig: mockValidateConnectorConfig,
  },
}));

import { ConnectorPropertiesStore } from './state';

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

// Helper to wait for a condition
async function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('ConnectorPropertiesStore', () => {
  beforeEach(() => {
    mockValidateConnectorConfig.mockClear();
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
      await waitFor(() => store.initPending === false);

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
      await waitFor(() => store.initPending === false);

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
      await waitFor(() => store.initPending === false);

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
      await waitFor(() => store.initPending === false);

      // Assert: custom_default_value strings should be applied
      expect(store.propsByName.get('bool.custom.true')?.value).toBe('true');
      expect(store.propsByName.get('bool.custom.false')?.value).toBe('false');
    });
  });
});
