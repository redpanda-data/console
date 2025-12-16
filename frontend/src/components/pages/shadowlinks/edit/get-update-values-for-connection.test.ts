/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { describe, expect, test } from 'vitest';

import { getUpdateValuesForConnection } from './shadowlink-edit-utils';
import type { FormValues } from '../create/model';
import { TLS_MODE } from '../create/model';

// Base form values for testing
const baseFormValues: FormValues = {
  name: 'test-shadow-link',
  bootstrapServers: [{ value: 'localhost:9092' }],
  advanceClientOptions: {
    metadataMaxAgeMs: 10_000,
    connectionTimeoutMs: 1000,
    retryBackoffMs: 100,
    fetchWaitMaxMs: 500,
    fetchMinBytes: 5_242_880,
    fetchMaxBytes: 20_971_520,
    fetchPartitionMaxBytes: 1_048_576,
  },
  useScram: true,
  scramCredentials: {
    username: 'admin',
    password: 'password123',
    mechanism: ScramMechanism.SCRAM_SHA_256,
  },
  useTls: true,
  mtlsMode: TLS_MODE.PEM,
  mtls: {
    ca: undefined,
    clientCert: undefined,
    clientKey: undefined,
  },
  topicsMode: 'all',
  topics: [],
  topicProperties: [],
  enableConsumerOffsetSync: false,
  consumersMode: 'all',
  consumers: [],
  aclsMode: 'all',
  aclFilters: [],
  excludeDefault: false,
};

describe('getUpdateValuesForConnection', () => {
  test('should return empty fieldMaskPaths when no changes', () => {
    const result = getUpdateValuesForConnection(baseFormValues, baseFormValues);

    expect(result.fieldMaskPaths).toEqual([]);
  });

  describe('Bootstrap servers changes', () => {
    test.each([
      {
        description: 'different server added',
        originalServers: [{ value: 'localhost:9092' }],
        newServers: [{ value: 'localhost:9092' }, { value: 'localhost:9093' }],
        expectedPath: 'configurations.client_options',
      },
      {
        description: 'server removed',
        originalServers: [{ value: 'localhost:9092' }, { value: 'localhost:9093' }],
        newServers: [{ value: 'localhost:9092' }],
        expectedPath: 'configurations.client_options',
      },
      {
        description: 'server value modified',
        originalServers: [{ value: 'localhost:9092' }],
        newServers: [{ value: 'example.com:9092' }],
        expectedPath: 'configurations.client_options',
      },
    ])('should detect $description', ({ originalServers, newServers, expectedPath }) => {
      const original = { ...baseFormValues, bootstrapServers: originalServers };
      const updated = { ...baseFormValues, bootstrapServers: newServers };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).toContain(expectedPath);
      expect(result.fieldMaskPaths).toHaveLength(1);
    });

    test('should NOT detect change when only server order changed (order-independent)', () => {
      const original = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'localhost:9092' }, { value: 'localhost:9093' }],
      };
      const updated = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'localhost:9093' }, { value: 'localhost:9092' }],
      };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).not.toContain('configurations.client_options.bootstrap_servers');
      expect(result.fieldMaskPaths).toEqual([]);
    });
  });

  describe('TLS settings changes', () => {
    test.each([
      {
        description: 'TLS enabled',
        originalUseTls: false,
        newUseTls: true,
        expectedPath: 'configurations.client_options.tls_settings',
      },
      {
        description: 'TLS disabled',
        originalUseTls: true,
        newUseTls: false,
        expectedPath: 'configurations.client_options.tls_settings',
      },
    ])('should detect $description', ({ originalUseTls, newUseTls, expectedPath }) => {
      const original = { ...baseFormValues, useTls: originalUseTls };
      const updated = { ...baseFormValues, useTls: newUseTls };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).toContain(expectedPath);
    });

    test('should detect when certificates are added', () => {
      const original = {
        ...baseFormValues,
        useTls: true,
        mtls: {
          ca: undefined,
          clientCert: undefined,
          clientKey: undefined,
        },
      };
      const updated = {
        ...baseFormValues,
        useTls: true,
        mtls: {
          ca: { pemContent: 'ca-cert-content' },
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.client_options.tls_settings');
    });

    test('should detect when certificates are removed', () => {
      const original = {
        ...baseFormValues,
        useTls: true,
        mtls: {
          ca: { pemContent: 'ca-cert-content' },
          clientCert: undefined,
          clientKey: undefined,
        },
      };
      const updated = {
        ...baseFormValues,
        useTls: true,
        mtls: {
          ca: undefined,
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.client_options.tls_settings');
    });

    test('should always include tls_settings when certificates are present even if unchanged', () => {
      const original = {
        ...baseFormValues,
        useTls: true,
        mtls: {
          ca: { pemContent: 'ca-cert-content' },
          clientCert: undefined,
          clientKey: undefined,
        },
      };
      const updated = {
        ...baseFormValues,
        useTls: true,
        mtls: {
          ca: { pemContent: 'ca-cert-content' },
          clientCert: undefined,
          clientKey: undefined,
        },
      };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.client_options.tls_settings');
    });
  });

  describe('Authentication changes', () => {
    test.each([
      {
        description: 'SCRAM enabled',
        originalUseScram: false,
        newUseScram: true,
        originalCredentials: undefined,
        newCredentials: { username: 'admin', password: 'pass', mechanism: ScramMechanism.SCRAM_SHA_256 },
        expectedPath: 'configurations.client_options.authentication_configuration',
      },
      {
        description: 'SCRAM disabled',
        originalUseScram: true,
        newUseScram: false,
        originalCredentials: { username: 'admin', password: 'pass', mechanism: ScramMechanism.SCRAM_SHA_256 },
        newCredentials: undefined,
        expectedPath: 'configurations.client_options.authentication_configuration',
      },
      {
        description: 'username changed',
        originalUseScram: true,
        newUseScram: true,
        originalCredentials: { username: 'admin', password: 'pass', mechanism: ScramMechanism.SCRAM_SHA_256 },
        newCredentials: { username: 'user2', password: 'pass', mechanism: ScramMechanism.SCRAM_SHA_256 },
        expectedPath: 'configurations.client_options.authentication_configuration',
      },
      {
        description: 'password changed',
        originalUseScram: true,
        newUseScram: true,
        originalCredentials: { username: 'admin', password: 'pass', mechanism: ScramMechanism.SCRAM_SHA_256 },
        newCredentials: { username: 'admin', password: 'newpass', mechanism: ScramMechanism.SCRAM_SHA_256 },
        expectedPath: 'configurations.client_options.authentication_configuration',
      },
      {
        description: 'mechanism changed',
        originalUseScram: true,
        newUseScram: true,
        originalCredentials: { username: 'admin', password: 'pass', mechanism: ScramMechanism.SCRAM_SHA_256 },
        newCredentials: { username: 'admin', password: 'pass', mechanism: ScramMechanism.SCRAM_SHA_512 },
        expectedPath: 'configurations.client_options.authentication_configuration',
      },
    ])('should detect $description', ({
      originalUseScram,
      newUseScram,
      originalCredentials,
      newCredentials,
      expectedPath,
    }) => {
      const original = { ...baseFormValues, useScram: originalUseScram, scramCredentials: originalCredentials };
      const updated = { ...baseFormValues, useScram: newUseScram, scramCredentials: newCredentials };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).toContain(expectedPath);
    });
  });

  describe('Advanced client options changes', () => {
    test.each([
      {
        field: 'metadataMaxAgeMs',
        originalValue: 10_000,
        newValue: 20_000,
        expectedPath: 'configurations.client_options.metadata_max_age_ms',
      },
      {
        field: 'connectionTimeoutMs',
        originalValue: 1000,
        newValue: 2000,
        expectedPath: 'configurations.client_options.connection_timeout_ms',
      },
      {
        field: 'retryBackoffMs',
        originalValue: 100,
        newValue: 200,
        expectedPath: 'configurations.client_options.retry_backoff_ms',
      },
      {
        field: 'fetchWaitMaxMs',
        originalValue: 500,
        newValue: 1000,
        expectedPath: 'configurations.client_options.fetch_wait_max_ms',
      },
      {
        field: 'fetchMinBytes',
        originalValue: 5_242_880,
        newValue: 10_485_760,
        expectedPath: 'configurations.client_options.fetch_min_bytes',
      },
      {
        field: 'fetchMaxBytes',
        originalValue: 20_971_520,
        newValue: 41_943_040,
        expectedPath: 'configurations.client_options.fetch_max_bytes',
      },
      {
        field: 'fetchPartitionMaxBytes',
        originalValue: 1_048_576,
        newValue: 2_097_152,
        expectedPath: 'configurations.client_options.fetch_partition_max_bytes',
      },
    ])('should detect $field changed', ({ field, originalValue, newValue, expectedPath }) => {
      const original = {
        ...baseFormValues,
        advanceClientOptions: { ...baseFormValues.advanceClientOptions, [field]: originalValue },
      };
      const updated = {
        ...baseFormValues,
        advanceClientOptions: { ...baseFormValues.advanceClientOptions, [field]: newValue },
      };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).toContain(expectedPath);
    });
  });

  describe('Multiple changes', () => {
    test('should detect multiple field changes with bootstrap change using parent path', () => {
      const original = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'localhost:9092' }],
        useScram: true,
        useTls: false,
        advanceClientOptions: {
          ...baseFormValues.advanceClientOptions,
          metadataMaxAgeMs: 10_000,
          fetchMaxBytes: 20_971_520,
        },
      };

      const updated = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'example.com:9092' }],
        useScram: false,
        useTls: true,
        advanceClientOptions: {
          ...baseFormValues.advanceClientOptions,
          metadataMaxAgeMs: 20_000,
          fetchMaxBytes: 41_943_040,
        },
      };

      const result = getUpdateValuesForConnection(updated, original);

      // When bootstrap changes, should use parent path only (covers all client_options)
      expect(result.fieldMaskPaths).toContain('configurations.client_options');
      expect(result.fieldMaskPaths).toHaveLength(1);
    });

    test('should detect all 7 advanced options changed', () => {
      const original = {
        ...baseFormValues,
        advanceClientOptions: {
          metadataMaxAgeMs: 10_000,
          connectionTimeoutMs: 1000,
          retryBackoffMs: 100,
          fetchWaitMaxMs: 500,
          fetchMinBytes: 5_242_880,
          fetchMaxBytes: 20_971_520,
          fetchPartitionMaxBytes: 1_048_576,
        },
      };

      const updated = {
        ...baseFormValues,
        advanceClientOptions: {
          metadataMaxAgeMs: 20_000,
          connectionTimeoutMs: 2000,
          retryBackoffMs: 200,
          fetchWaitMaxMs: 1000,
          fetchMinBytes: 10_485_760,
          fetchMaxBytes: 41_943_040,
          fetchPartitionMaxBytes: 2_097_152,
        },
      };

      const result = getUpdateValuesForConnection(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.client_options.metadata_max_age_ms');
      expect(result.fieldMaskPaths).toContain('configurations.client_options.connection_timeout_ms');
      expect(result.fieldMaskPaths).toContain('configurations.client_options.retry_backoff_ms');
      expect(result.fieldMaskPaths).toContain('configurations.client_options.fetch_wait_max_ms');
      expect(result.fieldMaskPaths).toContain('configurations.client_options.fetch_min_bytes');
      expect(result.fieldMaskPaths).toContain('configurations.client_options.fetch_max_bytes');
      expect(result.fieldMaskPaths).toContain('configurations.client_options.fetch_partition_max_bytes');
      expect(result.fieldMaskPaths).toHaveLength(7);
    });
  });

  describe('Schema building', () => {
    test('should build correct clientOptions schema', () => {
      const values = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'kafka1:9092' }, { value: 'kafka2:9092' }],
      };

      const result = getUpdateValuesForConnection(values, baseFormValues);

      expect(result.value.bootstrapServers).toEqual(['kafka1:9092', 'kafka2:9092']);
      expect(result.value.metadataMaxAgeMs).toBe(10_000);
      expect(result.value.connectionTimeoutMs).toBe(1000);
      expect(result.value.retryBackoffMs).toBe(100);
      expect(result.value.fetchWaitMaxMs).toBe(500);
      expect(result.value.fetchMinBytes).toBe(5_242_880);
      expect(result.value.fetchMaxBytes).toBe(20_971_520);
      expect(result.value.fetchPartitionMaxBytes).toBe(1_048_576);
    });

    test('should include TLS settings when useTls is true', () => {
      const values = {
        ...baseFormValues,
        useTls: true,
        useMtls: false,
      };

      const result = getUpdateValuesForConnection(values, baseFormValues);

      expect(result.value.tlsSettings).toBeDefined();
      expect(result.value.tlsSettings?.enabled).toBe(true);
    });

    test('should not include TLS settings when useTls is false', () => {
      const values = {
        ...baseFormValues,
        useTls: false,
        useMtls: false,
      };

      const result = getUpdateValuesForConnection(values, baseFormValues);

      expect(result.value.tlsSettings).toBeUndefined();
    });

    test('should include authentication when useScram is true', () => {
      const values = {
        ...baseFormValues,
        useScram: true,
        scramCredentials: {
          username: 'testuser',
          password: 'testpass',
          mechanism: ScramMechanism.SCRAM_SHA_512,
        },
      };

      const result = getUpdateValuesForConnection(values, baseFormValues);

      expect(result.value.authenticationConfiguration).toBeDefined();
      expect(result.value.authenticationConfiguration?.authentication?.case).toBe('scramConfiguration');
      if (result.value.authenticationConfiguration?.authentication?.case === 'scramConfiguration') {
        expect(result.value.authenticationConfiguration.authentication.value.username).toBe('testuser');
        expect(result.value.authenticationConfiguration.authentication.value.password).toBe('testpass');
        expect(result.value.authenticationConfiguration.authentication.value.scramMechanism).toBe(
          ScramMechanism.SCRAM_SHA_512
        );
      }
    });

    test('should not include authentication when useScram is false', () => {
      const values = {
        ...baseFormValues,
        useScram: false,
        scramCredentials: undefined,
      };

      const result = getUpdateValuesForConnection(values, baseFormValues);

      expect(result.value.authenticationConfiguration).toBeUndefined();
    });
  });
});
