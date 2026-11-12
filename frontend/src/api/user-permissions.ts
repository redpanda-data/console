import {
  type GetIdentityResponse,
  KafkaAclOperation,
  RedpandaCapability,
  SchemaRegistryCapability,
} from '../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import type { UserData } from '../state/rest-interfaces';

export function identityUserData(identity: GetIdentityResponse): UserData {
  const operations = identity.permissions?.kafkaClusterOperations ?? [];
  const redpanda = identity.permissions?.redpanda ?? [];
  const schemaRegistry = identity.permissions?.schemaRegistry ?? [];
  return {
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    authenticationMethod: identity.authenticationMethod,

    canListAcls: operations.includes(KafkaAclOperation.DESCRIBE),
    canListQuotas: operations.includes(KafkaAclOperation.DESCRIBE_CONFIGS),
    canPatchConfigs: operations.includes(KafkaAclOperation.ALTER_CONFIGS),
    canReassignPartitions:
      operations.includes(KafkaAclOperation.ALTER_CONFIGS) && operations.includes(KafkaAclOperation.DESCRIBE_CONFIGS),
    canCreateRoles: operations.includes(KafkaAclOperation.ALTER) && redpanda.includes(RedpandaCapability.MANAGE_RBAC),
    canViewPermissionsList:
      operations.includes(KafkaAclOperation.DESCRIBE) && redpanda.includes(RedpandaCapability.MANAGE_REDPANDA_USERS),

    canManageLicense: redpanda.includes(RedpandaCapability.MANAGE_LICENSE),
    canManageUsers: redpanda.includes(RedpandaCapability.MANAGE_REDPANDA_USERS),
    canCreateSchemas: schemaRegistry.includes(SchemaRegistryCapability.WRITE),
    canDeleteSchemas: schemaRegistry.includes(SchemaRegistryCapability.DELETE),
    canManageSchemaRegistry: schemaRegistry.includes(SchemaRegistryCapability.WRITE),
    canViewSchemas: schemaRegistry.includes(SchemaRegistryCapability.READ),
    canListTransforms: redpanda.includes(RedpandaCapability.MANAGE_TRANSFORMS),
    canCreateTransforms: redpanda.includes(RedpandaCapability.MANAGE_TRANSFORMS),
    canDeleteTransforms: redpanda.includes(RedpandaCapability.MANAGE_TRANSFORMS),
    canViewDebugBundle: redpanda.includes(RedpandaCapability.MANAGE_DEBUG_BUNDLE),
    canViewConsoleUsers: redpanda.includes(RedpandaCapability.MANAGE_RBAC),
  };
}
