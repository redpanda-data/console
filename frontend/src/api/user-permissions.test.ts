import { create } from '@bufbuild/protobuf';

import { identityUserData } from './user-permissions';
import { describe, expect, test } from 'bun:test';
import {
  AuthenticationMethod,
  GetIdentityResponseSchema,
  KafkaAclOperation,
  RedpandaCapability,
  SchemaRegistryCapability,
} from '../protogen/redpanda/api/console/v1alpha1/authentication_pb';

describe('identity permission projection', () => {
  test('denies every capability when identity has no permissions', () => {
    const result = identityUserData(
      create(GetIdentityResponseSchema, { displayName: 'Alice', authenticationMethod: AuthenticationMethod.BASIC })
    );
    const capabilities = Object.entries(result).filter(([name]) => name.startsWith('can'));
    expect(capabilities.length).toBeGreaterThan(0);
    for (const [, enabled] of capabilities) {
      expect(enabled).toBe(false);
    }
    expect(result.displayName).toBe('Alice');
    expect(result.authenticationMethod).toBe(AuthenticationMethod.BASIC);
  });
  test('requires both Kafka capabilities for reassignment', () => {
    const identity = create(GetIdentityResponseSchema, {
      permissions: { kafkaClusterOperations: [KafkaAclOperation.ALTER_CONFIGS] },
    });
    expect(identityUserData(identity).canPatchConfigs).toBe(true);
    expect(identityUserData(identity).canReassignPartitions).toBe(false);
    identity.permissions?.kafkaClusterOperations.push(KafkaAclOperation.DESCRIBE_CONFIGS);
    expect(identityUserData(identity).canReassignPartitions).toBe(true);
  });
  test('requires the matching Redpanda and Kafka capabilities for roles and permission lists', () => {
    const identity = create(GetIdentityResponseSchema, {
      permissions: { kafkaClusterOperations: [KafkaAclOperation.ALTER, KafkaAclOperation.DESCRIBE] },
    });
    expect(identityUserData(identity).canCreateRoles).toBe(false);
    expect(identityUserData(identity).canViewPermissionsList).toBe(false);
    identity.permissions?.redpanda.push(RedpandaCapability.MANAGE_RBAC);
    expect(identityUserData(identity).canCreateRoles).toBe(true);
    expect(identityUserData(identity).canViewPermissionsList).toBe(false);
    identity.permissions?.redpanda.push(RedpandaCapability.MANAGE_REDPANDA_USERS);
    expect(identityUserData(identity).canViewPermissionsList).toBe(true);
  });
  test('keeps registry read and write capabilities independent', () => {
    const result = identityUserData(
      create(GetIdentityResponseSchema, { permissions: { schemaRegistry: [SchemaRegistryCapability.WRITE] } })
    );
    expect(result.canCreateSchemas).toBe(true);
    expect(result.canDeleteSchemas).toBe(false);
    expect(result.canManageSchemaRegistry).toBe(true);
    expect(result.canViewSchemas).toBe(false);
    expect(
      identityUserData(
        create(GetIdentityResponseSchema, { permissions: { schemaRegistry: [SchemaRegistryCapability.DELETE] } })
      ).canDeleteSchemas
    ).toBe(true);
  });
});
