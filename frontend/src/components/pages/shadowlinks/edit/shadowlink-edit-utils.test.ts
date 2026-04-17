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
import { type ShadowLink, ShadowLinkSchema } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  ACLFilterSchema,
  AuthenticationConfigurationSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  ScramConfigSchema,
  ScramMechanism,
  SecuritySettingsSyncOptionsSchema,
  ShadowLinkConfigurationsSchema,
  ShadowLinkState,
  TopicMetadataSyncOptionsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import { describe, expect, test } from 'vitest';

import { buildDataplaneUpdateRequest } from './shadowlink-edit-utils';
import { buildDefaultFormValues } from '../mappers/dataplane';

/**
 * Create a mock shadow link matching the fixture in shadowlink-edit-page.test.tsx
 * (SCRAM auth, '*' topic filter, empty ACLs).
 */
const createMockShadowLink = (): ShadowLink =>
  create(ShadowLinkSchema, {
    name: 'test-shadow-link',
    uid: 'test-uid-123',
    state: ShadowLinkState.ACTIVE,
    configurations: create(ShadowLinkConfigurationsSchema, {
      clientOptions: {
        bootstrapServers: ['localhost:9092'],
        tlsSettings: undefined,
        authenticationConfiguration: create(AuthenticationConfigurationSchema, {
          authentication: {
            case: 'scramConfiguration',
            value: create(ScramConfigSchema, {
              username: 'test-user',
              password: 'test-pass',
              scramMechanism: ScramMechanism.SCRAM_SHA_256,
            }),
          },
        }),
        metadataMaxAgeMs: 10_000,
        connectionTimeoutMs: 1000,
        retryBackoffMs: 100,
        fetchWaitMaxMs: 500,
        fetchMinBytes: 5_242_880,
        fetchMaxBytes: 20_971_520,
        fetchPartitionMaxBytes: 1_048_576,
      },
      topicMetadataSyncOptions: create(TopicMetadataSyncOptionsSchema, {
        excludeDefault: true,
        syncedShadowTopicProperties: [],
        autoCreateShadowTopicFilters: [
          create(NameFilterSchema, {
            name: '*',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          }),
        ],
      }),
      consumerOffsetSyncOptions: undefined,
      securitySyncOptions: create(SecuritySettingsSyncOptionsSchema, {
        aclFilters: [],
      }),
    }),
  }) as ShadowLink;

describe('buildDataplaneUpdateRequest', () => {
  const mockShadowLink = createMockShadowLink();
  const defaultFormValues = buildDefaultFormValues(mockShadowLink);

  test('updates bootstrap server only', () => {
    const formValues = {
      ...defaultFormValues,
      bootstrapServers: [...defaultFormValues.bootstrapServers, { value: 'localhost:9093' }],
    };

    const request = buildDataplaneUpdateRequest('test-shadow-link', formValues, mockShadowLink);

    expect(request.updateMask?.paths).toEqual(['configurations.client_options']);
    expect(request.shadowLink?.configurations?.clientOptions?.bootstrapServers).toEqual([
      'localhost:9092',
      'localhost:9093',
    ]);
  });

  test('updates TLS and advanced options', () => {
    const formValues = {
      ...defaultFormValues,
      useTls: true,
      advanceClientOptions: {
        ...defaultFormValues.advanceClientOptions,
        metadataMaxAgeMs: 20_000,
      },
    };

    const request = buildDataplaneUpdateRequest('test-shadow-link', formValues, mockShadowLink);

    expect(request.updateMask?.paths).toHaveLength(2);
    expect(request.updateMask?.paths).toContain('configurations.client_options.tls_settings');
    expect(request.updateMask?.paths).toContain('configurations.client_options.metadata_max_age_ms');
    expect(request.shadowLink?.configurations?.clientOptions?.tlsSettings?.enabled).toBe(true);
    expect(request.shadowLink?.configurations?.clientOptions?.metadataMaxAgeMs).toBe(20_000);
  });

  test('updates all filter types', () => {
    const formValues = {
      ...defaultFormValues,
      topicsMode: 'specify' as const,
      topics: [{ name: 'my-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
      consumersMode: 'specify' as const,
      consumers: [{ name: 'my-consumer', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
      aclsMode: 'specify' as const,
      aclFilters: [
        {
          resourceType: ACLResource.ACL_RESOURCE_ANY,
          resourcePattern: ACLPattern.ACL_PATTERN_ANY,
          resourceName: '',
          principal: 'User:bob',
          operation: ACLOperation.ACL_OPERATION_ANY,
          permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
          host: '',
        },
      ],
    };

    const request = buildDataplaneUpdateRequest('test-shadow-link', formValues, mockShadowLink);

    expect(request.updateMask?.paths).toHaveLength(3);
    expect(request.updateMask?.paths).toContain('configurations.topic_metadata_sync_options');
    expect(request.updateMask?.paths).toContain('configurations.consumer_offset_sync_options');
    expect(request.updateMask?.paths).toContain('configurations.security_sync_options');

    expect(request.shadowLink?.configurations?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
      create(NameFilterSchema, {
        name: 'my-topic',
        patternType: PatternType.LITERAL,
        filterType: FilterType.INCLUDE,
      }),
    ]);
    expect(request.shadowLink?.configurations?.consumerOffsetSyncOptions?.groupFilters).toEqual([
      create(NameFilterSchema, {
        name: 'my-consumer',
        patternType: PatternType.LITERAL,
        filterType: FilterType.INCLUDE,
      }),
    ]);
    expect(request.shadowLink?.configurations?.securitySyncOptions?.aclFilters).toEqual([
      create(ACLFilterSchema, {
        resourceFilter: {
          resourceType: ACLResource.ACL_RESOURCE_ANY,
          patternType: ACLPattern.ACL_PATTERN_ANY,
          name: '',
        },
        accessFilter: {
          principal: 'User:bob',
          operation: ACLOperation.ACL_OPERATION_ANY,
          permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
          host: '',
        },
      }),
    ]);
  });

  test('adds multiple topic filters with different patterns', () => {
    const formValues = {
      ...defaultFormValues,
      topicsMode: 'specify' as const,
      topics: [
        { name: 'exact-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE },
        { name: 'exclude-', patternType: PatternType.PREFIX, filterType: FilterType.EXCLUDE },
        { name: 'include-', patternType: PatternType.PREFIX, filterType: FilterType.INCLUDE },
      ],
    };

    const request = buildDataplaneUpdateRequest('test-shadow-link', formValues, mockShadowLink);

    expect(request.updateMask?.paths).toEqual(['configurations.topic_metadata_sync_options']);
    expect(request.shadowLink?.configurations?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(3);
    expect(request.shadowLink?.configurations?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
      create(NameFilterSchema, { name: 'exact-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }),
      create(NameFilterSchema, { name: 'exclude-', patternType: PatternType.PREFIX, filterType: FilterType.EXCLUDE }),
      create(NameFilterSchema, { name: 'include-', patternType: PatternType.PREFIX, filterType: FilterType.INCLUDE }),
    ]);
  });

  test('updates multiple advanced client options', () => {
    const formValues = {
      ...defaultFormValues,
      advanceClientOptions: {
        ...defaultFormValues.advanceClientOptions,
        metadataMaxAgeMs: 30_000,
        connectionTimeoutMs: 2000,
        retryBackoffMs: 200,
        fetchWaitMaxMs: 1000,
      },
    };

    const request = buildDataplaneUpdateRequest('test-shadow-link', formValues, mockShadowLink);

    expect(request.updateMask?.paths).toHaveLength(4);
    expect(request.updateMask?.paths).toContain('configurations.client_options.metadata_max_age_ms');
    expect(request.updateMask?.paths).toContain('configurations.client_options.connection_timeout_ms');
    expect(request.updateMask?.paths).toContain('configurations.client_options.retry_backoff_ms');
    expect(request.updateMask?.paths).toContain('configurations.client_options.fetch_wait_max_ms');

    expect(request.shadowLink?.configurations?.clientOptions?.metadataMaxAgeMs).toBe(30_000);
    expect(request.shadowLink?.configurations?.clientOptions?.connectionTimeoutMs).toBe(2000);
    expect(request.shadowLink?.configurations?.clientOptions?.retryBackoffMs).toBe(200);
    expect(request.shadowLink?.configurations?.clientOptions?.fetchWaitMaxMs).toBe(1000);
  });

  test('handles cross-tab workflow maintaining state', () => {
    const formValues = {
      ...defaultFormValues,
      bootstrapServers: [...defaultFormValues.bootstrapServers, { value: 'cross-tab:9092' }],
      topicsMode: 'specify' as const,
      topics: [{ name: 'cross-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
      excludeDefault: !defaultFormValues.excludeDefault,
      consumersMode: 'specify' as const,
      consumers: [{ name: 'cross-consumer', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
    };

    const request = buildDataplaneUpdateRequest('test-shadow-link', formValues, mockShadowLink);

    expect(request.updateMask?.paths).toHaveLength(3);
    expect(request.updateMask?.paths).toContain('configurations.client_options');
    expect(request.updateMask?.paths).toContain('configurations.topic_metadata_sync_options');
    expect(request.updateMask?.paths).toContain('configurations.consumer_offset_sync_options');

    expect(request.shadowLink?.configurations?.clientOptions?.bootstrapServers).toContain('cross-tab:9092');
    expect(request.shadowLink?.configurations?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(1);
    expect(request.shadowLink?.configurations?.consumerOffsetSyncOptions?.groupFilters).toHaveLength(1);
    expect(request.shadowLink?.configurations?.topicMetadataSyncOptions?.excludeDefault).toBe(
      !defaultFormValues.excludeDefault
    );
  });

  test('updates only some filter types, not all', () => {
    const formValues = {
      ...defaultFormValues,
      topicsMode: 'specify' as const,
      topics: [{ name: 'selective-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
      consumersMode: 'specify' as const,
      consumers: [{ name: 'selective-consumer', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }],
    };

    const request = buildDataplaneUpdateRequest('test-shadow-link', formValues, mockShadowLink);

    expect(request.updateMask?.paths).toHaveLength(2);
    expect(request.updateMask?.paths).toContain('configurations.topic_metadata_sync_options');
    expect(request.updateMask?.paths).toContain('configurations.consumer_offset_sync_options');
    expect(request.updateMask?.paths).not.toContain('configurations.security_sync_options');

    expect(request.shadowLink?.configurations?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(1);
    expect(request.shadowLink?.configurations?.consumerOffsetSyncOptions?.groupFilters).toHaveLength(1);
  });
});
