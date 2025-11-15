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
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';
import { describe, expect, test } from 'vitest';

import { getUpdateValuesForACLs } from './shadowlink-edit-utils';
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
  useMtls: false,
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
};

describe('getUpdateValuesForACLs', () => {
  describe('ACL mode changes', () => {
    test('should detect change from all to specify mode', () => {
      const original = { ...baseFormValues, aclsMode: 'all' as const, aclFilters: [] };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters).toHaveLength(1);
      expect(result.value.aclFilters[0].resourceFilter?.resourceType).toBe(ACLResource.ACL_RESOURCE_TOPIC);
      expect(result.value.aclFilters[0].resourceFilter?.patternType).toBe(ACLPattern.ACL_PATTERN_LITERAL);
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('my-topic');
      expect(result.value.aclFilters[0].accessFilter?.principal).toBe('User:alice');
      expect(result.value.aclFilters[0].accessFilter?.operation).toBe(ACLOperation.ACL_OPERATION_READ);
      expect(result.value.aclFilters[0].accessFilter?.permissionType).toBe(ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW);
      expect(result.value.aclFilters[0].accessFilter?.host).toBe('192.168.1.1');
    });

    test('should detect change from specify to all mode', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = { ...baseFormValues, aclsMode: 'all' as const, aclFilters: [] };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters).toHaveLength(1);
      expect(result.value.aclFilters[0].resourceFilter?.resourceType).toBe(ACLResource.ACL_RESOURCE_ANY);
      expect(result.value.aclFilters[0].resourceFilter?.patternType).toBe(ACLPattern.ACL_PATTERN_ANY);
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('');
      expect(result.value.aclFilters[0].accessFilter?.principal).toBe('');
      expect(result.value.aclFilters[0].accessFilter?.operation).toBe(ACLOperation.ACL_OPERATION_ANY);
      expect(result.value.aclFilters[0].accessFilter?.permissionType).toBe(ACLPermissionType.ACL_PERMISSION_TYPE_ANY);
      expect(result.value.aclFilters[0].accessFilter?.host).toBe('');
    });
  });

  describe('ACL array changes', () => {
    test('should detect when an ACL is added to the list', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'topic1',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'topic1',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
          {
            resourceType: ACLResource.ACL_RESOURCE_GROUP,
            resourcePattern: ACLPattern.ACL_PATTERN_PREFIXED,
            resourceName: 'group-',
            principal: 'User:bob',
            operation: ACLOperation.ACL_OPERATION_WRITE,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_DENY,
            host: '192.168.1.2',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters).toHaveLength(2);
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('topic1');
      expect(result.value.aclFilters[1].resourceFilter?.name).toBe('group-');
    });

    test('should detect when an ACL is removed from the list', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'topic1',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
          {
            resourceType: ACLResource.ACL_RESOURCE_GROUP,
            resourcePattern: ACLPattern.ACL_PATTERN_PREFIXED,
            resourceName: 'group-',
            principal: 'User:bob',
            operation: ACLOperation.ACL_OPERATION_WRITE,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_DENY,
            host: '192.168.1.2',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'topic1',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters).toHaveLength(1);
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('topic1');
    });
  });

  describe('ACL filter property changes', () => {
    test('should detect when resourceType changes', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-resource',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_GROUP,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-resource',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters[0].resourceFilter?.resourceType).toBe(ACLResource.ACL_RESOURCE_GROUP);
    });

    test('should detect when resourcePattern changes', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-resource',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_PREFIXED,
            resourceName: 'my-resource',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters[0].resourceFilter?.patternType).toBe(ACLPattern.ACL_PATTERN_PREFIXED);
    });

    test('should detect when resourceName changes', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'other-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('other-topic');
    });

    test('should detect when principal changes', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:bob',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters[0].accessFilter?.principal).toBe('User:bob');
    });

    test('should detect when operation changes', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_WRITE,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters[0].accessFilter?.operation).toBe(ACLOperation.ACL_OPERATION_WRITE);
    });

    test('should detect when permissionType changes', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_DENY,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters[0].accessFilter?.permissionType).toBe(ACLPermissionType.ACL_PERMISSION_TYPE_DENY);
    });

    test('should detect when host changes', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.2',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.value.aclFilters[0].accessFilter?.host).toBe('192.168.1.2');
    });
  });

  describe('Multiple changes', () => {
    test('should detect multiple ACL changes at once (mode + multiple filters)', () => {
      const original = {
        ...baseFormValues,
        aclsMode: 'all' as const,
        aclFilters: [],
      };
      const updated = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'topic1',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
          {
            resourceType: ACLResource.ACL_RESOURCE_GROUP,
            resourcePattern: ACLPattern.ACL_PATTERN_PREFIXED,
            resourceName: 'group-',
            principal: 'User:bob',
            operation: ACLOperation.ACL_OPERATION_WRITE,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_DENY,
            host: '192.168.1.2',
          },
        ],
      };

      const result = getUpdateValuesForACLs(updated, original);

      expect(result.fieldMaskPaths).toContain('configurations.security_sync_options');
      expect(result.fieldMaskPaths).toHaveLength(1);

      // Validate schema values
      expect(result.value.aclFilters).toHaveLength(2);
      expect(result.value.aclFilters[0].resourceFilter?.resourceType).toBe(ACLResource.ACL_RESOURCE_TOPIC);
      expect(result.value.aclFilters[0].resourceFilter?.patternType).toBe(ACLPattern.ACL_PATTERN_LITERAL);
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('topic1');
      expect(result.value.aclFilters[0].accessFilter?.principal).toBe('User:alice');
      expect(result.value.aclFilters[0].accessFilter?.operation).toBe(ACLOperation.ACL_OPERATION_READ);
      expect(result.value.aclFilters[0].accessFilter?.permissionType).toBe(ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW);
      expect(result.value.aclFilters[0].accessFilter?.host).toBe('192.168.1.1');

      expect(result.value.aclFilters[1].resourceFilter?.resourceType).toBe(ACLResource.ACL_RESOURCE_GROUP);
      expect(result.value.aclFilters[1].resourceFilter?.patternType).toBe(ACLPattern.ACL_PATTERN_PREFIXED);
      expect(result.value.aclFilters[1].resourceFilter?.name).toBe('group-');
      expect(result.value.aclFilters[1].accessFilter?.principal).toBe('User:bob');
      expect(result.value.aclFilters[1].accessFilter?.operation).toBe(ACLOperation.ACL_OPERATION_WRITE);
      expect(result.value.aclFilters[1].accessFilter?.permissionType).toBe(ACLPermissionType.ACL_PERMISSION_TYPE_DENY);
      expect(result.value.aclFilters[1].accessFilter?.host).toBe('192.168.1.2');
    });
  });

  describe('Schema building', () => {
    test('should build correct schema for all mode (ANY for all fields)', () => {
      const values = {
        ...baseFormValues,
        aclsMode: 'all' as const,
        aclFilters: [],
      };

      const result = getUpdateValuesForACLs(values, baseFormValues);

      expect(result.value.aclFilters).toHaveLength(1);
      expect(result.value.aclFilters[0].resourceFilter?.resourceType).toBe(ACLResource.ACL_RESOURCE_ANY);
      expect(result.value.aclFilters[0].resourceFilter?.patternType).toBe(ACLPattern.ACL_PATTERN_ANY);
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('');
      expect(result.value.aclFilters[0].accessFilter?.principal).toBe('');
      expect(result.value.aclFilters[0].accessFilter?.operation).toBe(ACLOperation.ACL_OPERATION_ANY);
      expect(result.value.aclFilters[0].accessFilter?.permissionType).toBe(ACLPermissionType.ACL_PERMISSION_TYPE_ANY);
      expect(result.value.aclFilters[0].accessFilter?.host).toBe('');
    });

    test('should build correct schema for specify mode with single ACL', () => {
      const values = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(values, baseFormValues);

      expect(result.value.aclFilters).toHaveLength(1);
      expect(result.value.aclFilters[0].resourceFilter?.resourceType).toBe(ACLResource.ACL_RESOURCE_TOPIC);
      expect(result.value.aclFilters[0].resourceFilter?.patternType).toBe(ACLPattern.ACL_PATTERN_LITERAL);
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('my-topic');
      expect(result.value.aclFilters[0].accessFilter?.principal).toBe('User:alice');
      expect(result.value.aclFilters[0].accessFilter?.operation).toBe(ACLOperation.ACL_OPERATION_READ);
      expect(result.value.aclFilters[0].accessFilter?.permissionType).toBe(ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW);
      expect(result.value.aclFilters[0].accessFilter?.host).toBe('192.168.1.1');
    });

    test('should build correct schema for specify mode with multiple ACLs', () => {
      const values = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'topic1',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
          {
            resourceType: ACLResource.ACL_RESOURCE_GROUP,
            resourcePattern: ACLPattern.ACL_PATTERN_PREFIXED,
            resourceName: 'group-',
            principal: 'User:bob',
            operation: ACLOperation.ACL_OPERATION_WRITE,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_DENY,
            host: '192.168.1.2',
          },
        ],
      };

      const result = getUpdateValuesForACLs(values, baseFormValues);

      expect(result.value.aclFilters).toHaveLength(2);
      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('topic1');
      expect(result.value.aclFilters[0].accessFilter?.principal).toBe('User:alice');
      expect(result.value.aclFilters[1].resourceFilter?.name).toBe('group-');
      expect(result.value.aclFilters[1].accessFilter?.principal).toBe('User:bob');
    });

    test('should build correct schema with empty resourceName', () => {
      const values = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_CLUSTER,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: undefined,
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_DESCRIBE,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(values, baseFormValues);

      expect(result.value.aclFilters[0].resourceFilter?.name).toBe('');
    });

    test('should build correct schema with empty principal', () => {
      const values = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: undefined,
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '192.168.1.1',
          },
        ],
      };

      const result = getUpdateValuesForACLs(values, baseFormValues);

      expect(result.value.aclFilters[0].accessFilter?.principal).toBe('');
    });

    test('should build correct schema with empty host', () => {
      const values = {
        ...baseFormValues,
        aclsMode: 'specify' as const,
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'my-topic',
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: undefined,
          },
        ],
      };

      const result = getUpdateValuesForACLs(values, baseFormValues);

      expect(result.value.aclFilters[0].accessFilter?.host).toBe('');
    });
  });
});
