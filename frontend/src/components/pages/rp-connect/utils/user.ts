import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreateSecretRequestSchema as CreateSecretRequestSchemaConsole } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { CreateSecretRequestSchema, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useCreateACLMutation } from 'react-query/api/acl';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { useCreateUserMutation } from 'react-query/api/user';
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

export const createConsumerGroupACLs = (consumerGroupName: string, username: string) => {
  const operations = [ACL_Operation.READ, ACL_Operation.DESCRIBE];

  return operations.map((operation) => ({
    resourceType: ACL_ResourceType.GROUP,
    resourceName: consumerGroupName,
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

/**
 * Helper function to check if an ACL resource pattern matches a given topic name
 */
const doesPatternMatchTopic = (
  resourceName: string,
  patternType: ACL_ResourcePatternType,
  topicName: string
): boolean => {
  switch (patternType) {
    case ACL_ResourcePatternType.LITERAL:
      return resourceName === topicName;
    case ACL_ResourcePatternType.PREFIXED:
      return topicName.startsWith(resourceName);
    case ACL_ResourcePatternType.ANY:
      return true;
    default:
      return false;
  }
};

export const checkUserHasTopicReadWritePermissions = (
  aclResources: ListACLsResponse_Resource[],
  topicName: string,
  username: string
): TopicPermissionCheck => {
  const requiredOps = [ACL_Operation.READ, ACL_Operation.WRITE];

  // Filter ACLs for this specific topic (including LITERAL, PREFIXED, and ANY patterns)
  const topicACLs = aclResources.filter(
    (resource) =>
      resource.resourceType === ACL_ResourceType.TOPIC &&
      doesPatternMatchTopic(resource.resourceName, resource.resourcePatternType, topicName)
  );

  // Get all operations that the user has ALLOW permissions for
  const userAllowedOps = new Set<ACL_Operation>();
  const principal = `User:${username}`;

  for (const resource of topicACLs) {
    for (const acl of resource.acls) {
      if (acl.principal === principal && acl.permissionType === ACL_PermissionType.ALLOW) {
        // If user has ALL or ANY operation, they have all permissions including READ and WRITE
        if (acl.operation === ACL_Operation.ALL || acl.operation === ACL_Operation.ANY) {
          userAllowedOps.add(ACL_Operation.READ);
          userAllowedOps.add(ACL_Operation.WRITE);
        } else {
          userAllowedOps.add(acl.operation);
        }
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

export const checkUserHasConsumerGroupPermissions = (
  aclResources: ListACLsResponse_Resource[],
  consumerGroupName: string,
  username: string
): TopicPermissionCheck => {
  const requiredOps = [ACL_Operation.READ, ACL_Operation.DESCRIBE];

  // Filter ACLs for this specific consumer group (including LITERAL, PREFIXED, and ANY patterns)
  const groupACLs = aclResources.filter(
    (resource) =>
      resource.resourceType === ACL_ResourceType.GROUP &&
      doesPatternMatchTopic(resource.resourceName, resource.resourcePatternType, consumerGroupName)
  );

  // Get all operations that the user has ALLOW permissions for
  const userAllowedOps = new Set<ACL_Operation>();
  const principal = `User:${username}`;

  for (const resource of groupACLs) {
    for (const acl of resource.acls) {
      if (acl.principal === principal && acl.permissionType === ACL_PermissionType.ALLOW) {
        // If user has ALL or ANY operation, they have all permissions
        if (acl.operation === ACL_Operation.ALL || acl.operation === ACL_Operation.ANY) {
          userAllowedOps.add(ACL_Operation.READ);
          userAllowedOps.add(ACL_Operation.DESCRIBE);
        } else {
          userAllowedOps.add(acl.operation);
        }
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

export const configureConsumerGroupPermissions = async (
  consumerGroupName: string,
  username: string,
  createACLMutation: ReturnType<typeof useCreateACLMutation>
): Promise<OperationResult> => {
  try {
    const aclConfigs = createConsumerGroupACLs(consumerGroupName, username);

    for (const config of aclConfigs) {
      const aclRequest = create(CreateACLRequestSchema, config);
      await createACLMutation.mutateAsync(aclRequest);
    }

    return {
      operation: 'Configure consumer group permissions',
      success: true,
      message: `Granted consumer group permissions for "${consumerGroupName}"`,
    };
  } catch (error) {
    const connectError = ConnectError.from(error);
    return {
      operation: 'Configure consumer group permissions',
      success: false,
      error: formatToastErrorMessageGRPC({
        error: connectError,
        action: 'configure',
        entity: 'consumer group permissions',
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

export interface CreateUserWithSecretsParams {
  userData: AddUserFormData;
  topicName?: string;
  consumerGroup?: string;
  existingUserSelected: boolean;
}

export interface CreateUserWithSecretsResult {
  success: boolean;
  message: string;
  data: AddUserFormData;
  operations: OperationResult[];
  error?: string;
}

export const useCreateUserWithSecretsMutation = () => {
  const createUserMutation = useCreateUserMutation();
  const createACLMutation = useCreateACLMutation();
  const createSecretMutation = useCreateSecretMutation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateUserWithSecretsParams): Promise<CreateUserWithSecretsResult> => {
      const { userData, topicName, consumerGroup, existingUserSelected } = params;
      const operations: OperationResult[] = [];

      // If existing user is selected without consumer group, return early
      if (existingUserSelected && !consumerGroup) {
        return {
          success: true,
          message: `Using existing user "${userData.username}"`,
          data: userData,
          operations: [
            {
              operation: 'Select existing user',
              success: true,
              message: `Using existing user "${userData.username}"`,
            },
          ],
        };
      }

      // If existing user with consumer group, skip user creation but configure consumer group ACLs
      if (existingUserSelected && consumerGroup) {
        operations.push({
          operation: 'Select existing user',
          success: true,
          message: `Using existing user "${userData.username}"`,
        });

        // Configure consumer group ACL permissions
        const consumerGroupACLResult = await configureConsumerGroupPermissions(
          consumerGroup,
          userData.username,
          createACLMutation
        );
        operations.push(consumerGroupACLResult);

        if (!consumerGroupACLResult.success) {
          return {
            success: false,
            message: 'Failed to configure consumer group permissions for existing user',
            error: consumerGroupACLResult.error,
            data: userData,
            operations,
          };
        }

        // Invalidate ACL cache
        await queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: listACLs,
            cardinality: 'finite',
          }),
          exact: false,
        });

        return {
          success: true,
          message: `Configured consumer group permissions for existing user "${userData.username}"`,
          data: userData,
          operations,
        };
      }

      // Step 1: Create user
      const userResult = await createKafkaUser(userData, createUserMutation);
      operations.push(userResult);

      if (!userResult.success) {
        return {
          success: false,
          message: 'Failed to create user',
          error: userResult.error,
          data: userData,
          operations,
        };
      }

      // Step 2: Configure ACL permissions if topic is provided and user is superuser
      if (topicName && userData.superuser) {
        const aclResult = await configureUserPermissions(topicName, userData.username, createACLMutation);
        operations.push(aclResult);

        if (!aclResult.success) {
          return {
            success: false,
            message: 'User created but failed to configure permissions',
            error: aclResult.error,
            data: userData,
            operations,
          };
        }

        // Invalidate ACL cache to ensure fresh data on next query
        await queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: listACLs,
            cardinality: 'finite',
          }),
          exact: false,
        });
      }

      // Step 2b: Configure consumer group ACL permissions if consumer group is provided
      if (consumerGroup) {
        const consumerGroupACLResult = await configureConsumerGroupPermissions(
          consumerGroup,
          userData.username,
          createACLMutation
        );
        operations.push(consumerGroupACLResult);

        if (!consumerGroupACLResult.success) {
          return {
            success: false,
            message: 'User created but failed to configure consumer group permissions',
            error: consumerGroupACLResult.error,
            data: userData,
            operations,
          };
        }

        // Invalidate ACL cache to ensure fresh data on next query
        await queryClient.invalidateQueries({
          queryKey: createConnectQueryKey({
            schema: listACLs,
            cardinality: 'finite',
          }),
          exact: false,
        });
      }

      // Step 3: Create username secret
      const usernameSecretResult = await createUsernameSecret(userData.username, createSecretMutation);
      operations.push(usernameSecretResult);

      // Step 4: Create password secret
      const passwordSecretResult = await createPasswordSecret(
        userData.username,
        userData.password,
        createSecretMutation
      );
      operations.push(passwordSecretResult);

      // Aggregate results
      const allSucceeded = operations.every((op) => op.success);
      const criticalOps = operations.filter(
        (op) => op.operation.includes('user') || op.operation.includes('permissions')
      );
      const criticalSucceeded = criticalOps.length === 0 || criticalOps.every((op) => op.success);

      let message: string;
      if (allSucceeded) {
        message = `Created user "${userData.username}" successfully!`;
      } else if (criticalSucceeded) {
        message = `User "${userData.username}" created but some non-critical operations failed`;
      } else {
        message = 'Failed to complete user creation';
      }

      return {
        success: allSucceeded,
        message,
        data: userData,
        operations,
      };
    },
  });
};
