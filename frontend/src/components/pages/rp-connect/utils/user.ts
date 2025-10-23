import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { CreateSecretRequestSchema as CreateSecretRequestSchemaConsole } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { CreateSecretRequestSchema, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { useCreateACLMutation } from 'react-query/api/acl';
import type { useCreateSecretMutation } from 'react-query/api/secret';
import type { useCreateUserMutation } from 'react-query/api/user';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import type { SaslMechanism } from 'utils/user';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';

import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  CreateACLRequestSchema,
  type ListACLsResponse_Resource,
} from '../../../../protogen/redpanda/api/dataplane/v1/acl_pb';
import { CreateUserRequestSchema, SASLMechanism } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { convertToScreamingSnakeCase } from '../types/constants';
import type { AddUserFormData, OperationResult } from '../types/wizard';

export const saslMechanismToProto = (mechanism: SaslMechanism): SASLMechanism => {
  const mapping: Record<SaslMechanism, SASLMechanism> = {
    'SCRAM-SHA-256': SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
    'SCRAM-SHA-512': SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512,
  };
  return mapping[mechanism];
};

export const createTopicSuperuserACLs = (topicName: string, username: string) => {
  const operations = [
    ACL_Operation.ALL,
    ACL_Operation.READ,
    ACL_Operation.WRITE,
    ACL_Operation.CREATE,
    ACL_Operation.DELETE,
    ACL_Operation.DESCRIBE,
    ACL_Operation.DESCRIBE_CONFIGS,
    ACL_Operation.ALTER,
    ACL_Operation.ALTER_CONFIGS,
  ];

  return operations.map((operation) => ({
    resourceType: ACL_ResourceType.TOPIC,
    resourceName: topicName,
    resourcePatternType: ACL_ResourcePatternType.LITERAL,
    principal: `User:${username}`,
    host: '*',
    operation,
    permissionType: ACL_PermissionType.ALLOW,
  }));
};

export interface TopicPermissionCheck {
  hasPermissions: ACL_Operation[];
  missingPermissions: ACL_Operation[];
}

export const getACLOperationName = (operation: ACL_Operation): string => {
  switch (operation) {
    case ACL_Operation.READ:
      return 'READ';
    case ACL_Operation.WRITE:
      return 'WRITE';
    case ACL_Operation.CREATE:
      return 'CREATE';
    case ACL_Operation.DELETE:
      return 'DELETE';
    case ACL_Operation.ALTER:
      return 'ALTER';
    case ACL_Operation.DESCRIBE:
      return 'DESCRIBE';
    case ACL_Operation.ALL:
      return 'ALL';
    case ACL_Operation.DESCRIBE_CONFIGS:
      return 'DESCRIBE_CONFIGS';
    case ACL_Operation.ALTER_CONFIGS:
      return 'ALTER_CONFIGS';
    case ACL_Operation.CLUSTER_ACTION:
      return 'CLUSTER_ACTION';
    case ACL_Operation.IDEMPOTENT_WRITE:
      return 'IDEMPOTENT_WRITE';
    default:
      return 'UNKNOWN';
  }
};

export const checkUserHasTopicReadWritePermissions = (
  aclResources: ListACLsResponse_Resource[],
  topicName: string,
  username: string
): TopicPermissionCheck => {
  const requiredOps = [ACL_Operation.READ, ACL_Operation.WRITE];

  // Filter ACLs for this specific topic
  const topicACLs = aclResources.filter(
    (resource) =>
      resource.resourceType === ACL_ResourceType.TOPIC &&
      resource.resourceName === topicName &&
      resource.resourcePatternType === ACL_ResourcePatternType.LITERAL
  );

  // Get all operations that the user has ALLOW permissions for
  const userAllowedOps = new Set<ACL_Operation>();
  const principal = `User:${username}`;

  for (const resource of topicACLs) {
    for (const acl of resource.acls) {
      if (acl.principal === principal && acl.permissionType === ACL_PermissionType.ALLOW) {
        userAllowedOps.add(acl.operation);
      }
    }
  }

  // Determine which permissions the user has and which are missing
  const hasPermissions = requiredOps.filter((op) => userAllowedOps.has(op));
  const missingPermissions = requiredOps.filter((op) => !userAllowedOps.has(op));

  return {
    hasPermissions,
    missingPermissions,
  };
};

export const configureUserPermissions = async (
  topicName: string,
  username: string,
  createACLMutation: ReturnType<typeof useCreateACLMutation>
): Promise<OperationResult> => {
  try {
    const aclConfigs = createTopicSuperuserACLs(topicName, username);

    for (const config of aclConfigs) {
      const aclRequest = create(CreateACLRequestSchema, config);
      await createACLMutation.mutateAsync(aclRequest);
    }

    return {
      operation: 'Configure permissions',
      success: true,
      message: `Granted full permissions for topic "${topicName}"`,
    };
  } catch (error) {
    const connectError = ConnectError.from(error);
    return {
      operation: 'Configure permissions',
      success: false,
      error: formatToastErrorMessageGRPC({
        error: connectError,
        action: 'configure',
        entity: 'permissions',
      }),
    };
  }
};

export const createUsernameSecret = async (
  username: string,
  createSecretMutation: ReturnType<typeof useCreateSecretMutation>
): Promise<OperationResult> => {
  try {
    const usernameSecretRequest = create(CreateSecretRequestSchemaConsole, {
      request: create(CreateSecretRequestSchema, {
        id: `KAFKA_USER_${convertToScreamingSnakeCase(username)}`,
        secretData: base64ToUInt8Array(encodeBase64(username)),
        scopes: [Scope.REDPANDA_CONNECT],
        labels: {
          type: 'kafka_user',
          username,
        },
      }),
    });

    await createSecretMutation.mutateAsync(usernameSecretRequest);
    return {
      operation: 'Store username secret',
      success: true,
      message: 'Username stored securely for pipeline use',
    };
  } catch (error) {
    const connectError = ConnectError.from(error);
    return {
      operation: 'Store username secret',
      success: false,
      error: formatToastErrorMessageGRPC({
        error: connectError,
        action: 'store',
        entity: 'username secret',
      }),
    };
  }
};

export const createPasswordSecret = async (
  username: string,
  password: string,
  createSecretMutation: ReturnType<typeof useCreateSecretMutation>
): Promise<OperationResult> => {
  try {
    const passwordSecretRequest = create(CreateSecretRequestSchemaConsole, {
      request: create(CreateSecretRequestSchema, {
        id: `KAFKA_PASSWORD_${convertToScreamingSnakeCase(username)}`,
        secretData: base64ToUInt8Array(encodeBase64(password)),
        scopes: [Scope.REDPANDA_CONNECT],
        labels: {
          type: 'kafka_password',
          username,
        },
      }),
    });

    await createSecretMutation.mutateAsync(passwordSecretRequest);
    return {
      operation: 'Store password secret',
      success: true,
      message: 'Password stored securely for pipeline use',
    };
  } catch (error) {
    const connectError = ConnectError.from(error);
    return {
      operation: 'Store password secret',
      success: false,
      error: formatToastErrorMessageGRPC({
        error: connectError,
        action: 'store',
        entity: 'password secret',
      }),
    };
  }
};

export const createKafkaUser = async (
  userData: AddUserFormData,
  createUserMutation: ReturnType<typeof useCreateUserMutation>
): Promise<OperationResult> => {
  try {
    const createUserRequest = create(CreateUserRequestSchema, {
      user: {
        name: userData.username,
        password: userData.password,
        mechanism: saslMechanismToProto(userData.saslMechanism),
      },
    });

    await createUserMutation.mutateAsync(createUserRequest);
    return {
      operation: 'Create user',
      success: true,
      message: `User "${userData.username}" created successfully`,
    };
  } catch (error) {
    const connectError = ConnectError.from(error);
    return {
      operation: 'Create user',
      success: false,
      error: formatToastErrorMessageGRPC({
        error: connectError,
        action: 'create',
        entity: 'user',
      }),
    };
  }
};
