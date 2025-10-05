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
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  ListACLsResponse_PolicySchema,
  ListACLsResponse_ResourceSchema,
  ListACLsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { describe, expect, test } from 'vitest';
import {
  getAclFromAclListResponse,
  ModeAllowAll,
  ModeCustom,
  ModeDenyAll,
  OperationTypeAllow,
  OperationTypeDeny,
  ResourcePatternTypeLiteral,
  ResourcePatternTypePrefix,
} from './ACL.model';

describe('getAclFromAclListResponse', () => {
  describe('Single host scenarios', () => {
    test('should return single AclDetail for single host', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'test-topic',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].sharedConfig).toEqual({
        principal: 'User:alice',
        host: '192.168.1.1',
      });
      expect(result[0].rules).toHaveLength(1);
      expect(result[0].rules[0].resourceType).toBe('topic');
      expect(result[0].rules[0].selectorValue).toBe('test-topic');
      expect(result[0].rules[0].operations.READ).toBe(OperationTypeAllow);
    });

    test('should handle multiple operations for same resource on single host', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'test-topic',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.WRITE,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].rules).toHaveLength(1);
      expect(result[0].rules[0].operations.READ).toBe(OperationTypeAllow);
      expect(result[0].rules[0].operations.WRITE).toBe(OperationTypeAllow);
    });
  });

  describe('Multiple host scenarios', () => {
    test('should return separate AclDetail for each host', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'test-topic',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.2',
                operation: ACL_Operation.WRITE,
                permissionType: ACL_PermissionType.DENY,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result).toHaveLength(2);

      // Check first host
      const host1Result = result.find((r) => r.sharedConfig.host === '192.168.1.1');
      expect(host1Result).toBeDefined();
      expect(host1Result?.sharedConfig.principal).toBe('User:alice');
      expect(host1Result?.rules[0].operations.READ).toBe(OperationTypeAllow);
      expect(host1Result?.rules[0].operations.WRITE).toBeUndefined();

      // Check second host
      const host2Result = result.find((r) => r.sharedConfig.host === '192.168.1.2');
      expect(host2Result).toBeDefined();
      expect(host2Result?.sharedConfig.principal).toBe('User:alice');
      expect(host2Result?.rules[0].operations.WRITE).toBe(OperationTypeDeny);
      expect(host2Result?.rules[0].operations.READ).toBeUndefined();
    });

    test('should group multiple resources by host correctly', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'topic-1',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'topic-2',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.WRITE,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].rules).toHaveLength(2);
      expect(result[0].rules[0].selectorValue).toBe('topic-1');
      expect(result[0].rules[1].selectorValue).toBe('topic-2');
    });

    test('should handle three hosts with different operations', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.CLUSTER,
            resourceName: 'kafka-cluster',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:admin',
                host: 'host-a',
                operation: ACL_Operation.CREATE,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:admin',
                host: 'host-b',
                operation: ACL_Operation.ALTER,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:admin',
                host: 'host-c',
                operation: ACL_Operation.DESCRIBE,
                permissionType: ACL_PermissionType.DENY,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result).toHaveLength(3);
      expect(result.map((r) => r.sharedConfig.host)).toEqual(expect.arrayContaining(['host-a', 'host-b', 'host-c']));

      const hostA = result.find((r) => r.sharedConfig.host === 'host-a');
      expect(hostA?.rules[0].operations.CREATE).toBe(OperationTypeAllow);

      const hostB = result.find((r) => r.sharedConfig.host === 'host-b');
      expect(hostB?.rules[0].operations.ALTER).toBe(OperationTypeAllow);

      const hostC = result.find((r) => r.sharedConfig.host === 'host-c');
      expect(hostC?.rules[0].operations.DESCRIBE).toBe(OperationTypeDeny);
    });
  });

  describe('Mode detection', () => {
    test('should detect ModeAllowAll when ALL operation is ALLOW', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'test-topic',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.ALL,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result[0].rules[0].mode).toBe(ModeAllowAll);
      expect(result[0].rules[0].operations.ALL).toBe(OperationTypeAllow);
    });

    test('should detect ModeDenyAll when ALL operation is DENY', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'test-topic',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.ALL,
                permissionType: ACL_PermissionType.DENY,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result[0].rules[0].mode).toBe(ModeDenyAll);
      expect(result[0].rules[0].operations.ALL).toBe(OperationTypeDeny);
    });

    test('should detect ModeCustom for mixed operations', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'test-topic',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.WRITE,
                permissionType: ACL_PermissionType.DENY,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result[0].rules[0].mode).toBe(ModeCustom);
    });

    test('should detect ModeAllowAll when all possible operations are ALLOW', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.GROUP,
            resourceName: 'test-group',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.DELETE,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.DESCRIBE,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      // for context groups, possible operations are DELETE, DESCRIBE, READ.
      // consumerGroup: {
      //   DELETE: OperationTypeNotSet,
      //   DESCRIBE: OperationTypeNotSet,
      //   READ: OperationTypeNotSet,
      // },

      const result = getAclFromAclListResponse(response);

      expect(result[0].rules[0].mode).toBe(ModeAllowAll);
    });
  });

  describe('Resource types and patterns', () => {
    test('should handle CLUSTER resource type', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.CLUSTER,
            resourceName: 'kafka-cluster',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:admin',
                host: '*',
                operation: ACL_Operation.CLUSTER_ACTION,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result[0].rules[0].resourceType).toBe('cluster');
      expect(result[0].rules[0].operations.CLUSTER_ACTION).toBe(OperationTypeAllow);
      expect(result[0].rules[0].selectorType).toBe(ResourcePatternTypeLiteral);
    });

    test('should handle PREFIX pattern type', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'test-',
            resourcePatternType: ACL_ResourcePatternType.PREFIXED,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '192.168.1.1',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result[0].rules[0].selectorType).toBe(ResourcePatternTypePrefix);
      expect(result[0].rules[0].selectorValue).toBe('test-');
    });

    test('should handle TRANSACTIONAL_ID resource type', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TRANSACTIONAL_ID,
            resourceName: 'tx-123',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:producer',
                host: '10.0.0.1',
                operation: ACL_Operation.WRITE,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result[0].rules[0].resourceType).toBe('transactionalId');
    });
  });

  describe('Edge cases', () => {
    test('should return empty array for empty response', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [],
      });

      const result = getAclFromAclListResponse(response);

      expect(result).toEqual([]);
    });

    test('should handle wildcard host', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'test-topic',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: '*',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result).toHaveLength(1);
      expect(result[0].sharedConfig.host).toBe('*');
    });

    test('should maintain separate rule IDs for each host', () => {
      const response = create(ListACLsResponseSchema, {
        resources: [
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'topic-1',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: 'host-a',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: 'host-b',
                operation: ACL_Operation.READ,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
          create(ListACLsResponse_ResourceSchema, {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'topic-2',
            resourcePatternType: ACL_ResourcePatternType.LITERAL,
            acls: [
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: 'host-a',
                operation: ACL_Operation.WRITE,
                permissionType: ACL_PermissionType.ALLOW,
              }),
              create(ListACLsResponse_PolicySchema, {
                principal: 'User:alice',
                host: 'host-b',
                operation: ACL_Operation.WRITE,
                permissionType: ACL_PermissionType.ALLOW,
              }),
            ],
          }),
        ],
      });

      const result = getAclFromAclListResponse(response);

      expect(result).toHaveLength(2);

      // Each host should have 2 rules with IDs 0 and 1
      const hostA = result.find((r) => r.sharedConfig.host === 'host-a');
      expect(hostA?.rules).toHaveLength(2);
      expect(hostA?.rules[0].id).toBe(0);
      expect(hostA?.rules[1].id).toBe(1);

      const hostB = result.find((r) => r.sharedConfig.host === 'host-b');
      expect(hostB?.rules).toHaveLength(2);
      expect(hostB?.rules[0].id).toBe(0);
      expect(hostB?.rules[1].id).toBe(1);
    });
  });
});
