import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { createConnectQueryKey } from '@connectrpc/connect-query';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { CreateSecretRequestSchema as CreateSecretRequestSchemaConsole } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { CreateSecretRequestSchema, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useCreateACLMutation } from 'react-query/api/acl';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { useCreateUserMutation } from 'react-query/api/user';
import { toast } from 'sonner';
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
import { userSecretIds } from '../types/constants';
import type { AddUserFormData, OperationResult } from '../types/wizard';

const createConsumerGroupACLs = (consumerGroupName: string, username: string) => {
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

type TopicPermissionCheck = {
  hasPermissions: ACL_Operation[];
  missingPermissions: ACL_Operation[];
};

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
      return resourceName === topicName || resourceName === '*';
    case ACL_ResourcePatternType.PREFIXED:
      return topicName.startsWith(resourceName);
    case ACL_ResourcePatternType.ANY:
      return true;
    default:
      return false;
  }
};

/** Operations `username` holds an ALLOW for across `resources`; ALL/ANY stand for `impliedByAll`. */
const allowedOperations = (
  resources: ListACLsResponse_Resource[],
  username: string,
  impliedByAll: ACL_Operation[]
): Set<ACL_Operation> => {
  const allowed = new Set<ACL_Operation>();
  const principal = `User:${username}`;

  for (const resource of resources) {
    for (const acl of resource.acls) {
      if (acl.principal === principal && acl.permissionType === ACL_PermissionType.ALLOW) {
        const isWildcard = acl.operation === ACL_Operation.ALL || acl.operation === ACL_Operation.ANY;
        for (const operation of isWildcard ? impliedByAll : [acl.operation]) {
          allowed.add(operation);
        }
      }
    }
  }
  return allowed;
};

// Determine which permissions the user has and which are missing
const splitByGranted = (requiredOps: ACL_Operation[], allowed: Set<ACL_Operation>): TopicPermissionCheck => ({
  hasPermissions: requiredOps.filter((op) => allowed.has(op)),
  missingPermissions: requiredOps.filter((op) => !allowed.has(op)),
});

/** What a component does with its topic. */
export type TopicAccess = 'read' | 'write' | 'read-write';

const TOPIC_ACCESS_OPERATIONS: Record<TopicAccess, ACL_Operation[]> = {
  read: [ACL_Operation.READ],
  write: [ACL_Operation.WRITE],
  'read-write': [ACL_Operation.READ, ACL_Operation.WRITE],
};

export const checkUserHasTopicPermissions = (
  aclResources: ListACLsResponse_Resource[],
  topicName: string,
  username: string,
  access: TopicAccess
): TopicPermissionCheck => {
  const requiredOps = TOPIC_ACCESS_OPERATIONS[access];

  // Filter ACLs for this specific topic (including LITERAL, PREFIXED, and ANY patterns)
  const topicACLs = aclResources.filter(
    (resource) =>
      resource.resourceType === ACL_ResourceType.TOPIC &&
      doesPatternMatchTopic(resource.resourceName, resource.resourcePatternType, topicName)
  );

  // Get all operations that the user has ALLOW permissions for. If user has ALL or ANY operation,
  // they have all permissions including READ and WRITE.
  const userAllowedOps = allowedOperations(topicACLs, username, [ACL_Operation.READ, ACL_Operation.WRITE]);

  return splitByGranted(requiredOps, userAllowedOps);
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

  // Get all operations that the user has ALLOW permissions for. If user has ALL or ANY operation,
  // they have all permissions.
  const userAllowedOps = allowedOperations(groupACLs, username, [ACL_Operation.READ, ACL_Operation.DESCRIBE]);

  return splitByGranted(requiredOps, userAllowedOps);
};

const configureUserPermissions = async (
  topicName: string,
  username: string,
  createACLMutation: ReturnType<typeof useCreateACLMutation>
): Promise<OperationResult> => {
  try {
    const aclConfigs = {
      resourceType: ACL_ResourceType.TOPIC,
      resourceName: topicName,
      resourcePatternType: ACL_ResourcePatternType.LITERAL,
      principal: `User:${username}`,
      host: '*',
      operation: ACL_Operation.ALL,
      permissionType: ACL_PermissionType.ALLOW,
    };

    const aclRequest = create(CreateACLRequestSchema, aclConfigs);
    await createACLMutation.mutateAsync(aclRequest);

    return {
      operation: 'Configure permissions',
      success: true,
      message: `Granted full permissions for user "${username}" on topic "${topicName}"`,
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

// One grant at a time: they share a single mutation observer, and a failed grant stops the rest.
const createACLsInOrder = async (
  [config, ...rest]: ReturnType<typeof createConsumerGroupACLs>,
  createACLMutation: ReturnType<typeof useCreateACLMutation>
): Promise<void> => {
  if (!config) {
    return;
  }
  await createACLMutation.mutateAsync(create(CreateACLRequestSchema, config));
  await createACLsInOrder(rest, createACLMutation);
};

const configureConsumerGroupPermissions = async (
  consumerGroupName: string,
  username: string,
  createACLMutation: ReturnType<typeof useCreateACLMutation>
): Promise<OperationResult> => {
  try {
    await createACLsInOrder(createConsumerGroupACLs(consumerGroupName, username), createACLMutation);

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

const createUsernameSecret = async (
  username: string,
  createSecretMutation: ReturnType<typeof useCreateSecretMutation>
): Promise<OperationResult> => {
  try {
    const usernameSecretRequest = create(CreateSecretRequestSchemaConsole, {
      request: create(CreateSecretRequestSchema, {
        id: userSecretIds(username).username,
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
      message: `Created secret for username: "${username}"`,
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

const createPasswordSecret = async (
  username: string,
  password: string,
  createSecretMutation: ReturnType<typeof useCreateSecretMutation>
): Promise<OperationResult> => {
  try {
    const passwordSecretRequest = create(CreateSecretRequestSchemaConsole, {
      request: create(CreateSecretRequestSchema, {
        id: userSecretIds(username).password,
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
      message: `Created secret for ${username}'s password`,
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

const saslMechanismToProtoMapping: Record<SaslMechanism, SASLMechanism> = {
  'SCRAM-SHA-256': SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
  'SCRAM-SHA-512': SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512,
};

/** The SCRAM mechanism a user was created with, if it is one. */
export const saslMechanismFromProto = (mechanism: SASLMechanism | undefined): SaslMechanism | undefined =>
  (Object.keys(saslMechanismToProtoMapping) as SaslMechanism[]).find(
    (name) => saslMechanismToProtoMapping[name] === mechanism
  );

const createKafkaUser = async (
  userData: AddUserFormData,
  createUserMutation: ReturnType<typeof useCreateUserMutation>
): Promise<OperationResult> => {
  try {
    const createUserRequest = create(CreateUserRequestSchema, {
      user: {
        name: userData.username,
        password: userData.password,
        mechanism: saslMechanismToProtoMapping[userData.saslMechanism],
      },
    });

    await createUserMutation.mutateAsync(createUserRequest);
    return {
      operation: 'Create user',
      success: true,
      message: `User "${userData.username}" created`,
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

type CreateUserWithSecretsParams = {
  userData: AddUserFormData;
  topicName?: string;
  consumerGroup?: string;
  existingUserSelected: boolean;
};

const handleOperationResult = (result: OperationResult) => {
  if (result.success && result.message) {
    toast.success(result.message);
  } else if (!result.success && result.error) {
    toast.error(result.error);
  }
};

// Toasts a required step's outcome; false when it failed, so the flow stops there.
const reportRequiredStep = (result: OperationResult, failureMessage: string, successMessage: string): boolean => {
  if (!result.success) {
    toast.error(result.error || failureMessage);
    return false;
  }
  toast.success(result.message || successMessage);
  return true;
};

// Step 1: Create user, unless it exists
const ensureUser = async (
  userData: AddUserFormData,
  existingUserSelected: boolean,
  createUserMutation: ReturnType<typeof useCreateUserMutation>
): Promise<boolean> => {
  if (existingUserSelected) {
    toast.success(`Using existing user "${userData.username}"`);
    return true;
  }
  const userResult = await createKafkaUser(userData, createUserMutation);
  return reportRequiredStep(userResult, 'Failed to create user', `User "${userData.username}" created`);
};

// Step 2: Configure topic ACL if needed
const grantTopicAccess = async (
  userData: AddUserFormData,
  topicName: string | undefined,
  createACLMutation: ReturnType<typeof useCreateACLMutation>
): Promise<boolean> => {
  if (!(topicName && userData.grantTopicPermissions)) {
    return true;
  }
  const aclResult = await configureUserPermissions(topicName, userData.username, createACLMutation);
  return reportRequiredStep(aclResult, 'Failed to configure topic permissions', 'Topic permissions configured');
};

// Step 3: Configure consumer group ACL if needed
const grantConsumerGroupAccess = async (
  userData: AddUserFormData,
  consumerGroup: string | undefined,
  createACLMutation: ReturnType<typeof useCreateACLMutation>,
  queryClient: QueryClient
): Promise<boolean> => {
  if (!consumerGroup) {
    return true;
  }
  const consumerGroupACLResult = await configureConsumerGroupPermissions(
    consumerGroup,
    userData.username,
    createACLMutation
  );
  if (
    !reportRequiredStep(
      consumerGroupACLResult,
      'Failed to configure consumer group permissions',
      'Consumer group permissions configured'
    )
  ) {
    return false;
  }
  await queryClient.invalidateQueries({
    queryKey: createConnectQueryKey({ schema: listACLs, cardinality: 'finite' }),
    exact: false,
  });
  return true;
};

const storeUserSecrets = async (
  userData: AddUserFormData,
  createSecretMutation: ReturnType<typeof useCreateSecretMutation>
): Promise<void> => {
  // Step 4: Create username secret
  handleOperationResult(await createUsernameSecret(userData.username, createSecretMutation));

  // Step 5: Create password secret
  handleOperationResult(await createPasswordSecret(userData.username, userData.password, createSecretMutation));
};

export const useCreateUserWithSecretsMutation = () => {
  const createUserMutation = useCreateUserMutation();
  const createACLMutation = useCreateACLMutation();
  const createSecretMutation = useCreateSecretMutation();
  const queryClient = useQueryClient();

  // Aggregate isPending from all mutations
  const isPending = createUserMutation.isPending || createACLMutation.isPending || createSecretMutation.isPending;

  const createUserWithSecrets = async ({
    userData,
    topicName,
    consumerGroup,
    existingUserSelected,
  }: CreateUserWithSecretsParams) => {
    if (!(await ensureUser(userData, existingUserSelected, createUserMutation))) {
      return { success: false, data: userData };
    }
    if (!(await grantTopicAccess(userData, topicName, createACLMutation))) {
      return { success: false, data: userData };
    }
    if (!(await grantConsumerGroupAccess(userData, consumerGroup, createACLMutation, queryClient))) {
      return { success: false, data: userData };
    }

    // Only a user created here has a password to store.
    if (!existingUserSelected) {
      await storeUserSecrets(userData, createSecretMutation);
    }
    return { success: true, data: userData };
  };

  return {
    createUserWithSecrets,
    isPending,
  };
};
