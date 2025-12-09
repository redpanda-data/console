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

import { create } from '@bufbuild/protobuf';
import { ShadowLinkSchema } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  ACLFilterSchema,
  ConsumerOffsetSyncOptionsSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  ScramMechanism,
  SecuritySettingsSyncOptionsSchema,
  ShadowLinkConfigurationsSchema,
  ShadowLinkState,
  TopicMetadataSyncOptionsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import { describe, expect, test } from 'vitest';

import { buildControlplaneUpdateRequest, buildDataplaneUpdateRequest } from './shadowlink-edit-utils';
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
  useScram: false,
  scramCredentials: undefined,
  useTls: false,
  mtlsMode: TLS_MODE.PEM,
  mtls: {
    ca: undefined,
    clientCert: undefined,
    clientKey: undefined,
  },
  topicsMode: 'specify',
  topics: [{ name: 'my-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
  topicProperties: [],
  enableConsumerOffsetSync: false,
  consumersMode: 'all',
  consumers: [],
  aclsMode: 'specify',
  aclFilters: [
    {
      resourceType: ACLResource.ACL_RESOURCE_TOPIC,
      resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
      resourceName: 'my-topic',
      principal: 'User:admin',
      operation: ACLOperation.ACL_OPERATION_READ,
      permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
      host: '*',
    },
  ],
  excludeDefault: false,
  enableSchemaRegistrySync: false,
};

// Helper to create a minimal ShadowLink proto for testing
// This matches the baseFormValues structure to ensure no false positives
const createBaseShadowLink = () =>
  create(ShadowLinkSchema, {
    name: 'test-shadow-link',
    uid: 'test-uid-123',
    state: ShadowLinkState.ACTIVE,
    configurations: create(ShadowLinkConfigurationsSchema, {
      clientOptions: {
        bootstrapServers: ['localhost:9092'],
        metadataMaxAgeMs: 10_000,
        connectionTimeoutMs: 1000,
        retryBackoffMs: 100,
        fetchWaitMaxMs: 500,
        fetchMinBytes: 5_242_880,
        fetchMaxBytes: 20_971_520,
        fetchPartitionMaxBytes: 1_048_576,
      },
      topicMetadataSyncOptions: create(TopicMetadataSyncOptionsSchema, {
        autoCreateShadowTopicFilters: [
          create(NameFilterSchema, {
            name: 'my-topic',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          }),
        ],
        syncedShadowTopicProperties: [],
        excludeDefault: false,
      }),
      consumerOffsetSyncOptions: create(ConsumerOffsetSyncOptionsSchema, {
        groupFilters: [
          create(NameFilterSchema, {
            name: '*',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          }),
        ],
      }),
      securitySyncOptions: create(SecuritySettingsSyncOptionsSchema, {
        aclFilters: [
          create(ACLFilterSchema, {
            resourceFilter: {
              resourceType: ACLResource.ACL_RESOURCE_TOPIC,
              patternType: ACLPattern.ACL_PATTERN_LITERAL,
              name: 'my-topic',
            },
            accessFilter: {
              principal: 'User:admin',
              operation: ACLOperation.ACL_OPERATION_READ,
              permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
              host: '*',
            },
          }),
        ],
      }),
      // Schema registry sync disabled (no schemaRegistryShadowingMode set)
    }),
    tasksStatus: [],
    syncedShadowTopicProperties: [],
  });

describe('buildControlplaneUpdateRequest', () => {
  describe('field mask path stripping', () => {
    test.each([
      {
        description: 'bootstrap servers change',
        changes: { bootstrapServers: [{ value: 'new-host:9092' }] },
        expectedPathContains: 'client_options',
        shouldNotContain: 'configurations.client_options',
      },
      {
        description: 'TLS settings change',
        changes: { useTls: true },
        expectedPathContains: 'client_options.tls_settings',
        shouldNotContain: 'configurations.client_options.tls_settings',
      },
      {
        description: 'topic filters change',
        changes: {
          topicsMode: 'specify' as const,
          topics: [{ name: 'test-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
        },
        expectedPathContains: 'topic_metadata_sync_options',
        shouldNotContain: 'configurations.topic_metadata_sync_options',
      },
      {
        description: 'consumer groups change',
        changes: {
          consumersMode: 'specify' as const,
          consumers: [{ name: 'test-group', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
        },
        expectedPathContains: 'consumer_offset_sync_options',
        shouldNotContain: 'configurations.consumer_offset_sync_options',
      },
    ])(
      'should strip "configurations." prefix when $description',
      ({ changes, expectedPathContains, shouldNotContain }) => {
        const updatedValues = { ...baseFormValues, ...changes };

        const result = buildControlplaneUpdateRequest('shadow-link-id-123', updatedValues, baseFormValues);

        const paths = result.updateMask?.paths ?? [];
        expect(paths.some((p) => p.includes(expectedPathContains))).toBe(true);
        expect(paths.every((p) => !p.startsWith('configurations.'))).toBe(true);
        expect(paths.some((p) => p === shouldNotContain)).toBe(false);
      }
    );
  });

  describe('request structure', () => {
    test('should include shadowLink ID in request', () => {
      const shadowLinkId = 'unique-shadow-link-id';
      const updatedValues = { ...baseFormValues, bootstrapServers: [{ value: 'changed:9092' }] };

      const result = buildControlplaneUpdateRequest(shadowLinkId, updatedValues, baseFormValues);

      expect(result.shadowLink?.id).toBe(shadowLinkId);
    });

    test('should build flat structure without nested configurations', () => {
      const updatedValues = { ...baseFormValues, bootstrapServers: [{ value: 'changed:9092' }] };

      const result = buildControlplaneUpdateRequest('test-id', updatedValues, baseFormValues);

      // Controlplane uses flat structure - properties directly on shadowLink
      expect(result.shadowLink?.clientOptions?.bootstrapServers).toEqual(['changed:9092']);
      expect(result.shadowLink?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
        expect.objectContaining({
          name: 'my-topic',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        }),
      ]);
      expect(result.shadowLink?.consumerOffsetSyncOptions?.groupFilters).toEqual([
        expect.objectContaining({
          name: '*',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        }),
      ]);
      expect(result.shadowLink?.securitySyncOptions?.aclFilters).toEqual([
        expect.objectContaining({
          resourceFilter: expect.objectContaining({
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            patternType: ACLPattern.ACL_PATTERN_LITERAL,
            name: 'my-topic',
          }),
          accessFilter: expect.objectContaining({
            principal: 'User:admin',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '*',
          }),
        }),
      ]);
    });

    test('should include bootstrap servers in clientOptions', () => {
      const updatedValues = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'kafka1:9092' }, { value: 'kafka2:9092' }],
      };

      const result = buildControlplaneUpdateRequest('test-id', updatedValues, baseFormValues);

      expect(result.shadowLink?.clientOptions?.bootstrapServers).toEqual(['kafka1:9092', 'kafka2:9092']);
    });
  });

  describe('combining field masks', () => {
    test('should combine field masks when connection and topics change', () => {
      const updatedValues = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'new:9092' }],
        topicsMode: 'specify' as const,
        topics: [{ name: 'topic1', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
      };

      const result = buildControlplaneUpdateRequest('test-id', updatedValues, baseFormValues);

      expect(result.updateMask?.paths).toEqual(
        expect.arrayContaining(['client_options', 'topic_metadata_sync_options'])
      );
      expect(result.updateMask?.paths?.length).toBe(2);
      expect(result.shadowLink?.clientOptions?.bootstrapServers).toEqual(['new:9092']);
      expect(result.shadowLink?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
        expect.objectContaining({ name: 'topic1' }),
      ]);
    });

    test('should combine field masks when all categories change', () => {
      const updatedValues = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'new:9092' }],
        topicsMode: 'specify' as const,
        topics: [{ name: 'topic1', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
        consumersMode: 'specify' as const,
        consumers: [{ name: 'group1', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'test-topic',
            principal: 'User:test',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '*',
          },
        ],
        enableSchemaRegistrySync: true,
      };

      const result = buildControlplaneUpdateRequest('test-id', updatedValues, baseFormValues);

      expect(result.updateMask?.paths).toEqual(
        expect.arrayContaining([
          'client_options',
          'topic_metadata_sync_options',
          'consumer_offset_sync_options',
          'security_sync_options',
          'schema_registry_sync_options',
        ])
      );
      expect(result.updateMask?.paths?.length).toBe(5);
      expect(result.shadowLink?.clientOptions?.bootstrapServers).toEqual(['new:9092']);
      expect(result.shadowLink?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
        expect.objectContaining({ name: 'topic1' }),
      ]);
      expect(result.shadowLink?.consumerOffsetSyncOptions?.groupFilters).toEqual([
        expect.objectContaining({ name: 'group1' }),
      ]);
      expect(result.shadowLink?.securitySyncOptions?.aclFilters).toEqual([
        expect.objectContaining({
          resourceFilter: expect.objectContaining({ name: 'test-topic' }),
          accessFilter: expect.objectContaining({ principal: 'User:test' }),
        }),
      ]);
      expect(result.shadowLink?.schemaRegistrySyncOptions).toBeDefined();
    });
  });
});

describe('buildDataplaneUpdateRequest', () => {
  describe('field mask path preservation', () => {
    test.each([
      {
        description: 'bootstrap servers change',
        changes: { bootstrapServers: [{ value: 'new-host:9092' }] },
        expectedPath: 'configurations.client_options',
      },
      {
        description: 'TLS settings change',
        changes: { useTls: true },
        expectedPath: 'configurations.client_options.tls_settings',
      },
      {
        description: 'authentication change',
        changes: {
          useScram: true,
          scramCredentials: { username: 'user', password: 'pass', mechanism: ScramMechanism.SCRAM_SHA_256 },
        },
        expectedPath: 'configurations.client_options.authentication_configuration',
      },
      {
        description: 'topic filters change',
        changes: {
          topicsMode: 'specify' as const,
          topics: [{ name: 'test-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
        },
        expectedPath: 'configurations.topic_metadata_sync_options',
      },
      {
        description: 'consumer groups change',
        changes: {
          consumersMode: 'specify' as const,
          consumers: [{ name: 'test-group', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
        },
        expectedPath: 'configurations.consumer_offset_sync_options',
      },
      {
        description: 'schema registry change',
        changes: { enableSchemaRegistrySync: true },
        expectedPath: 'configurations.schema_registry_sync_options',
      },
    ])('should preserve "configurations." prefix when $description', ({ changes, expectedPath }) => {
      const baseShadowLink = createBaseShadowLink();
      const updatedValues = { ...baseFormValues, ...changes };

      const result = buildDataplaneUpdateRequest('test-shadow-link', updatedValues, baseShadowLink);

      expect(result.updateMask?.paths).toContain(expectedPath);
    });
  });

  describe('request structure', () => {
    test('should include shadow link name in request', () => {
      const shadowLinkName = 'my-shadow-link';
      const baseShadowLink = createBaseShadowLink();
      const updatedValues = { ...baseFormValues, bootstrapServers: [{ value: 'changed:9092' }] };

      const result = buildDataplaneUpdateRequest(shadowLinkName, updatedValues, baseShadowLink);

      expect(result.shadowLink?.name).toBe(shadowLinkName);
    });

    test('should build nested configurations structure', () => {
      const baseShadowLink = createBaseShadowLink();
      const updatedValues = { ...baseFormValues, bootstrapServers: [{ value: 'changed:9092' }] };

      const result = buildDataplaneUpdateRequest('test-name', updatedValues, baseShadowLink);

      // Dataplane uses nested structure - configurations object contains all options
      expect(result.shadowLink?.configurations).toBeDefined();
      expect(result.shadowLink?.configurations?.clientOptions).toBeDefined();
      expect(result.shadowLink?.configurations?.topicMetadataSyncOptions).toBeDefined();
      expect(result.shadowLink?.configurations?.consumerOffsetSyncOptions).toBeDefined();
      expect(result.shadowLink?.configurations?.securitySyncOptions).toBeDefined();
    });

    test('should include bootstrap servers in nested clientOptions', () => {
      const baseShadowLink = createBaseShadowLink();
      const updatedValues = {
        ...baseFormValues,
        bootstrapServers: [{ value: 'kafka1:9092' }, { value: 'kafka2:9092' }],
      };

      const result = buildDataplaneUpdateRequest('test-name', updatedValues, baseShadowLink);

      expect(result.shadowLink?.configurations?.clientOptions?.bootstrapServers).toEqual([
        'kafka1:9092',
        'kafka2:9092',
      ]);
    });
  });

  describe('combining field masks', () => {
    test.each([
      {
        description: 'single category (connection)',
        changes: { bootstrapServers: [{ value: 'new:9092' }] },
        expectedPathCount: 1,
      },
      {
        description: 'two categories (connection and topics)',
        changes: {
          bootstrapServers: [{ value: 'new:9092' }],
          topicsMode: 'specify' as const,
          topics: [{ name: 'topic1', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
        },
        expectedPathCount: 2,
      },
      {
        description: 'all five categories',
        changes: {
          bootstrapServers: [{ value: 'new:9092' }],
          topicsMode: 'specify' as const,
          topics: [{ name: 'topic1', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
          consumersMode: 'specify' as const,
          consumers: [{ name: 'group1', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
          aclsMode: 'specify' as const,
          aclFilters: [
            {
              resourceType: ACLResource.ACL_RESOURCE_TOPIC,
              resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
              resourceName: 'test-topic',
              principal: 'User:test',
              operation: ACLOperation.ACL_OPERATION_READ,
              permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
              host: '*',
            },
          ],
          enableSchemaRegistrySync: true,
        },
        expectedPathCount: 5,
      },
    ])('should have $expectedPathCount paths when $description changed', ({ changes, expectedPathCount }) => {
      const baseShadowLink = createBaseShadowLink();
      const updatedValues = { ...baseFormValues, ...changes };

      const result = buildDataplaneUpdateRequest('test-name', updatedValues, baseShadowLink);

      expect(result.updateMask?.paths?.length).toBe(expectedPathCount);
    });
  });

  describe('empty field mask', () => {
    test('should have empty updateMask paths when no changes from original', () => {
      const baseShadowLink = createBaseShadowLink();

      const result = buildDataplaneUpdateRequest('test-shadow-link', baseFormValues, baseShadowLink);

      expect(result.updateMask?.paths).toEqual([]);
    });
  });
});
