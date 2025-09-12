import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type CreateACLRequest,
  type ListACLsResponse,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import type { ReactNode } from 'react';
import type { ConnectError } from '@connectrpc/connect';
import type { UseToastOptions } from '@redpanda-data/ui';

export type OperationType = 'not-set' | 'allow' | 'deny';
export const OperationTypeNotSet: OperationType = 'not-set';
export const OperationTypeAllow: OperationType = 'allow';
export const OperationTypeDeny: OperationType = 'deny';

export type HostType = 'Allow all hosts' | 'Specific host';
export const HostTypeAllowAllHosts: HostType = 'Allow all hosts';
export const HostTypeSpecificHost: HostType = 'Specific host';

export type PrincipalType = 'User:' | 'RedpandaRole:';
export const PrincipalTypeUser: PrincipalType = 'User:';
export const PrincipalTypeRedpandaRole: PrincipalType = 'RedpandaRole:';

export type RoleType = 'RedpandaRole' | 'User';
export const RoleTypeRedpandaRole: RoleType = 'RedpandaRole';
export const RoleTypeUser: RoleType = 'User';

export type ModeType = 'custom' | 'allowAll' | 'denyAll';
export const ModeCustom: ModeType = 'custom';
export const ModeAllowAll: ModeType = 'allowAll';
export const ModeDenyAll: ModeType = 'denyAll';

export type ResourceType = 'cluster' | 'topic' | 'consumerGroup' | 'transactionalId' | 'subject' | 'schemaRegistry';
export const ResourceTypeCluster: ResourceType = 'cluster';
export const ResourceTypeTopic: ResourceType = 'topic';
export const ResourceTypeConsumerGroup: ResourceType = 'consumerGroup';
export const ResourceTypeTransactionalId: ResourceType = 'transactionalId';
export const ResourceTypeSubject: ResourceType = 'subject';
export const ResourceTypeSchemaRegistry: ResourceType = 'schemaRegistry';

export type ResourcePatternType = 'any' | 'literal' | 'prefix';
export const ResourcePatternTypeAny: ResourcePatternType = 'any';
export const ResourcePatternTypeLiteral: ResourcePatternType = 'literal';
export const ResourcePatternTypePrefix: ResourcePatternType = 'prefix';

export interface Rule {
  id: number;
  resourceType: ResourceType;
  mode: ModeType;
  selectorType: ResourcePatternType;
  selectorValue: string;
  operations: Record<string, OperationType>;
}

export interface SharedConfig {
  principal: string;
  host: string;
}

export type AclDetail = {
  sharedConfig: SharedConfig;
  rules: Rule[];
};

// ACL constants for operations
export const operationSets: Record<ResourceType, Record<string, OperationType>> = {
  cluster: {
    ALTER: OperationTypeNotSet,
    ALTER_CONFIGS: OperationTypeNotSet,
    CLUSTER_ACTION: OperationTypeNotSet,
    CREATE: OperationTypeNotSet,
    DESCRIBE: OperationTypeNotSet,
    DESCRIBE_CONFIGS: OperationTypeNotSet,
    IDEMPOTENT_WRITE: OperationTypeNotSet,
  },
  topic: {
    ALTER: OperationTypeNotSet,
    ALTER_CONFIGS: OperationTypeNotSet,
    CREATE: OperationTypeNotSet,
    DELETE: OperationTypeNotSet,
    DESCRIBE: OperationTypeNotSet,
    DESCRIBE_CONFIGS: OperationTypeNotSet,
    READ: OperationTypeNotSet,
    WRITE: OperationTypeNotSet,
  },
  consumerGroup: {
    DELETE: OperationTypeNotSet,
    DESCRIBE: OperationTypeNotSet,
    READ: OperationTypeNotSet,
  },
  transactionalId: {
    DESCRIBE: OperationTypeNotSet,
    WRITE: OperationTypeNotSet,
  },
  subject: {
    READ: OperationTypeNotSet,
    WRITE: OperationTypeNotSet,
    DELETE: OperationTypeNotSet,
    DESCRIBE_CONFIGS: OperationTypeNotSet,
    ALTER_CONFIGS: OperationTypeNotSet,
  },
  schemaRegistry: {
    DESCRIBE_CONFIGS: OperationTypeNotSet,
    ALTER_CONFIGS: OperationTypeNotSet,
    DESCRIBE: OperationTypeNotSet,
    READ: OperationTypeNotSet,
  },
};

export interface SharedConfigProps {
  sharedConfig: SharedConfig;
  setSharedConfig: (config: { principal: string; host: string }) => void;
  openMatchingSections: Record<string, boolean>;
  setOpenMatchingSections: (setter: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  getSectionKey: (ruleId: number, section: string) => string;
  edit: boolean;
}

export interface AclRulesProps {
  rules: Rule[];
  addRule: () => void;
  addAllowAllOperations: () => void;
  removeRule: (id: number) => void;
  updateRule: (id: number, updates: any) => void;
  isSubjectDisabledForRule: (ruleId: number) => boolean;
  isClusterDisabledForRule: (ruleId: number) => boolean;
  isSchemaRegistryDisabledForRule: (ruleId: number) => boolean;
  handleResourceTypeChange: (ruleId: number, resourceType: ResourceType) => void;
  handlePermissionModeChange: (ruleId: number, mode: string) => void;
  handleOperationChange: (ruleId: number, operation: string, value: string) => void;
  setOpenMatchingSections: (setter: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  getSubjectTooltipText: () => string;
  getSchemaRegistryTooltipText: () => string;
  getPermissionIcon: (value: string) => JSX.Element;
  getPermissionDescription: (operation: string, resourceType: string) => ReactNode;
  getSectionKey: (ruleId: number, section: string) => string;
  openMatchingSections: Record<string, boolean>;
  schemaRegistryEnabled: boolean;
}

export interface SummaryProps {
  sharedConfig: { principal: string; host: string };
  rules: Rule[];
}

export interface ResourceTypeSelectionProps {
  rule: Rule;
  handleResourceTypeChange: (ruleId: number, resourceType: ResourceType) => void;
  isClusterDisabledForRule: (ruleId: number) => boolean;
  isSubjectDisabledForRule: (ruleId: number) => boolean;
  isSchemaRegistryDisabledForRule: (ruleId: number) => boolean;
  getSubjectTooltipText: () => string;
  getSchemaRegistryTooltipText: () => string;
  ruleIndex: number;
  isSchemaRegistryEnabled: boolean;
}

export const parsePrincipal = (principal: string): { type: string; name: string } => {
  let [type, name] = principal.split(':'); // Split at the first colon
  name = name ?? '';
  return {
    type,
    name,
  };
};

export const getResourceNameValue = (rule: Rule): string => {
  let resourceName = rule.selectorValue;
  if (rule.resourceType === ResourceTypeCluster) {
    resourceName = 'kafka-cluster';
  } else if (rule.selectorValue === '') {
    resourceName = '*';
  }
  return resourceName;
};

// from ACL model to gRPC types
export function getGRPCPermissionType(operation: OperationType): ACL_PermissionType {
  switch (operation) {
    case OperationTypeAllow:
      return ACL_PermissionType.ALLOW;
    case OperationTypeDeny:
      return ACL_PermissionType.DENY;
    default:
      return ACL_PermissionType.UNSPECIFIED;
  }
}

export function getGRPCResourceType(operation: ResourceType): ACL_ResourceType {
  switch (operation) {
    case ResourceTypeCluster:
      return ACL_ResourceType.CLUSTER;
    case ResourceTypeTopic:
      return ACL_ResourceType.TOPIC;
    case ResourceTypeConsumerGroup:
      return ACL_ResourceType.GROUP;
    case ResourceTypeTransactionalId:
      return ACL_ResourceType.TRANSACTIONAL_ID;
    case ResourceTypeSubject:
      return ACL_ResourceType.SUBJECT;
    case ResourceTypeSchemaRegistry:
      return ACL_ResourceType.REGISTRY;
    default:
      return ACL_ResourceType.UNSPECIFIED;
  }
}

export function getGRPCResourcePatternType(pattern: ResourcePatternType): ACL_ResourcePatternType {
  switch (pattern) {
    case ResourcePatternTypeAny:
      return ACL_ResourcePatternType.ANY;
    case ResourcePatternTypeLiteral:
      return ACL_ResourcePatternType.LITERAL;
    case ResourcePatternTypePrefix:
      return ACL_ResourcePatternType.PREFIXED;
    default:
      return ACL_ResourcePatternType.UNSPECIFIED;
  }
}

export function getGRPCOperationType(op: string): ACL_Operation {
  switch (op) {
    case 'ALL':
      return ACL_Operation.ALL;
    case 'READ':
      return ACL_Operation.READ;
    case 'WRITE':
      return ACL_Operation.WRITE;
    case 'CREATE':
      return ACL_Operation.CREATE;
    case 'DELETE':
      return ACL_Operation.DELETE;
    case 'ALTER':
      return ACL_Operation.ALTER;
    case 'DESCRIBE':
      return ACL_Operation.DESCRIBE;
    case 'CLUSTER_ACTION':
      return ACL_Operation.CLUSTER_ACTION;
    case 'DESCRIBE_CONFIGS':
      return ACL_Operation.DESCRIBE_CONFIGS;
    case 'ALTER_CONFIGS':
      return ACL_Operation.ALTER_CONFIGS;
    case 'IDEMPOTENT_WRITE':
      return ACL_Operation.IDEMPOTENT_WRITE;
    default:
      return ACL_Operation.UNSPECIFIED;
  }
}

// from gRPC types to ACL model

function getResourceTypeFromGRPC(grpcType: ACL_ResourceType): ResourceType {
  switch (grpcType) {
    case ACL_ResourceType.CLUSTER:
      return ResourceTypeCluster;
    case ACL_ResourceType.TOPIC:
      return ResourceTypeTopic;
    case ACL_ResourceType.GROUP:
      return ResourceTypeConsumerGroup;
    case ACL_ResourceType.TRANSACTIONAL_ID:
      return ResourceTypeTransactionalId;
    case ACL_ResourceType.SUBJECT:
      return ResourceTypeSubject;
    case ACL_ResourceType.REGISTRY:
      return ResourceTypeSchemaRegistry;
    default:
      return ResourceTypeTopic; // Default fallback
  }
}

function getResourcePatternTypeFromGRPC(grpcPattern: ACL_ResourcePatternType): ResourcePatternType {
  switch (grpcPattern) {
    case ACL_ResourcePatternType.ANY:
      return ResourcePatternTypeAny;
    case ACL_ResourcePatternType.LITERAL:
      return ResourcePatternTypeLiteral;
    case ACL_ResourcePatternType.PREFIXED:
      return ResourcePatternTypePrefix;
    default:
      return ResourcePatternTypeLiteral; // Default fallback
  }
}

function getOperationTypeFromGRPC(grpcPermission: ACL_PermissionType): OperationType {
  switch (grpcPermission) {
    case ACL_PermissionType.ALLOW:
      return OperationTypeAllow;
    case ACL_PermissionType.DENY:
      return OperationTypeDeny;
    default:
      return OperationTypeNotSet;
  }
}

function getOperationNameFromGRPC(grpcOp: ACL_Operation): string {
  switch (grpcOp) {
    case ACL_Operation.ALL:
      return 'ALL';
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
    case ACL_Operation.CLUSTER_ACTION:
      return 'CLUSTER_ACTION';
    case ACL_Operation.DESCRIBE_CONFIGS:
      return 'DESCRIBE_CONFIGS';
    case ACL_Operation.ALTER_CONFIGS:
      return 'ALTER_CONFIGS';
    case ACL_Operation.IDEMPOTENT_WRITE:
      return 'IDEMPOTENT_WRITE';
    default:
      return 'UNKNOWN';
  }
}

// function to convert ACL List response to AclDetail
export const getAclFromAclListResponse = (aclList: ListACLsResponse): AclDetail => {
  // Extract principal and host from the first ACL entry (assuming all have the same host)
  let principal = '';
  let host = '*';

  if (aclList.resources.length > 0 && aclList.resources[0].acls.length > 0) {
    principal = aclList.resources[0].acls[0].principal;
    host = aclList.resources[0].acls[0].host;
  }

  // Transform resources into rules
  const rulesMap = new Map<string, Rule>();
  let ruleIdCounter = 0;

  aclList.resources.forEach((resource) => {
    const resourceType = getResourceTypeFromGRPC(resource.resourceType);
    const selectorType = getResourcePatternTypeFromGRPC(resource.resourcePatternType);
    const selectorValue = resource.resourceName;

    // Create a unique key for each resource configuration
    const ruleKey = `${resourceType}-${selectorType}-${selectorValue}`;

    if (!rulesMap.has(ruleKey)) {
      rulesMap.set(ruleKey, {
        id: ruleIdCounter++,
        resourceType,
        mode: ModeCustom,
        selectorType,
        selectorValue,
        operations: {},
      });
    }

    // biome-ignore lint/style/noNonNullAssertion: in the previous line we ensured the key exists
    const rule = rulesMap.get(ruleKey)!;

    // Add operations from ACLs (assuming all ACLs have the same principal and host)
    resource.acls.forEach((acl) => {
      const operationName = getOperationNameFromGRPC(acl.operation);
      const operationType = getOperationTypeFromGRPC(acl.permissionType);

      rule.operations[operationName] = operationType;
    });

    // Determine mode based on operations
    const operationValues = Object.values(rule.operations);
    const allOperationKeys = Object.keys(getOperationsForResourceType(resourceType));

    if (rule.operations.ALL) {
      if (rule.operations.ALL === OperationTypeAllow) {
        rule.mode = ModeAllowAll;
      }
      if (rule.operations.ALL === OperationTypeDeny) {
        rule.mode = ModeDenyAll;
      }
    } else if (
      allOperationKeys.length === operationValues.length &&
      operationValues.every((op) => op === OperationTypeAllow)
    ) {
      rule.mode = ModeAllowAll;
    } else if (
      allOperationKeys.length === operationValues.length &&
      operationValues.every((op) => op === OperationTypeDeny)
    ) {
      rule.mode = ModeDenyAll;
    } else {
      rule.mode = ModeCustom;
    }
  });

  return {
    sharedConfig: {
      principal,
      host,
    },
    rules: Array.from(rulesMap.values()),
  };
};

export const getOperationsForResourceType = (resourceType: ResourceType): Record<string, OperationType> => {
  return operationSets[resourceType] || {};
};

// Generate a unique key for an ACL based on Rule and SharedConfig
export function getIdFromRule(rule: Rule, operation: string, permission: OperationType): string {
  const sep = '-';
  const resourceName = getResourceNameValue(rule);
  const grpcResourceType = getGRPCResourceType(rule.resourceType);
  const grpcPatternType =
    rule.selectorType === ResourcePatternTypeAny
      ? ACL_ResourcePatternType.LITERAL
      : getGRPCResourcePatternType(rule.selectorType);
  const grpcOperation = getGRPCOperationType(operation);
  const grpcPermission = getGRPCPermissionType(permission);
  return (
    resourceName +
    sep +
    String(grpcResourceType) +
    sep +
    String(grpcPatternType) +
    sep +
    String(grpcOperation) +
    sep +
    String(grpcPermission)
  );
}

// Generate a unique key for an ACL from CreateACLRequest
export function getIdFromCreateACLRequest(request: CreateACLRequest): string {
  const sep = '-';
  return (
    request.principal +
    sep +
    request.resourceName +
    sep +
    String(request.resourceType) +
    sep +
    String(request.resourcePatternType) +
    sep +
    request.host +
    sep +
    String(request.operation) +
    sep +
    String(request.permissionType)
  );
}

// Convert rules to CreateACLRequest array for API calls
export function convertRulesToCreateACLRequests(rules: Rule[], principal: string, host: string): CreateACLRequest[] {
  return rules.reduce((acc, r) => {
    const baseRule: Pick<CreateACLRequest, 'resourcePatternType' | '$typeName' | 'resourceName'> = {
      resourcePatternType:
        r.selectorType === 'any' ? ACL_ResourcePatternType.LITERAL : getGRPCResourcePatternType(r.selectorType),
      $typeName: 'redpanda.api.dataplane.v1.CreateACLRequest',
      resourceName: getResourceNameValue(r),
    };
    if (r.mode === ModeAllowAll) {
      const a: CreateACLRequest = {
        ...baseRule,
        host: host,
        principal: principal,
        resourceType: getGRPCResourceType(r.resourceType),
        operation: ACL_Operation.ALL,
        permissionType: ACL_PermissionType.ALLOW,
      };
      acc.push(a);
    }
    if (r.mode === ModeDenyAll) {
      const a: CreateACLRequest = {
        ...baseRule,
        host: host,
        principal: principal,
        resourceType: getGRPCResourceType(r.resourceType),
        operation: ACL_Operation.ALL,
        permissionType: ACL_PermissionType.DENY,
      };
      acc.push(a);
    }
    if (r.mode === ModeCustom) {
      const customResults = Object.entries(r.operations).reduce((acc, [op, value]) => {
        if (value !== OperationTypeNotSet) {
          acc.push({
            ...baseRule,
            host: host,
            principal: principal,
            resourceType: getGRPCResourceType(r.resourceType),
            operation: getGRPCOperationType(op),
            permissionType: getGRPCPermissionType(value),
          });
        }
        return acc;
      }, [] as CreateACLRequest[]);
      acc.push(...customResults);
    }
    return acc;
  }, [] as CreateACLRequest[]);
}

// Helper function to convert UPPER_CASE strings to sentence case
export const formatLabel = (text: string): string => {
  return text
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
};

// Helper function to generate rule data-testid
export const getRuleDataTestId = (rule: Rule): string => {
  const rt =
    rule.selectorType === 'any' ? ACL_ResourcePatternType.LITERAL : getGRPCResourcePatternType(rule.selectorType);

  return `${rule.resourceType}-${rt}-${getResourceNameValue(rule)}`;
};

interface ACLWithId extends CreateACLRequest {
  id: string;
}

export interface ACLDifference {
  toCreate: ACLWithId[];
  toDelete: ACLWithId[];
}

/**
 * Compares current ACL rules with new rules to determine which need to be created and deleted
 * @param currentRules - The existing ACL rules
 * @param newRules - The desired ACL rules
 * @returns Object containing arrays of rules to create and delete
 */
export function calculateACLDifference(currentRules: ACLWithId[], newRules: ACLWithId[]): ACLDifference {
  const currentIds = new Set(currentRules.map((r) => r.id));
  const newIds = new Set(newRules.map((r) => r.id));

  // Rules to create: in newRules but not in currentRules
  const toCreate = newRules.filter((rule) => !currentIds.has(rule.id));

  // Rules to delete: in currentRules but not in newRules
  const toDelete = currentRules.filter((rule) => !newIds.has(rule.id));

  return {
    toCreate,
    toDelete,
  };
}

export const handleResponses = (toast: (op: UseToastOptions) => void, errors: ConnectError[], created: boolean) => {
  if (errors.length > 0 && created) {
    errors.forEach((er) => {
      toast({
        status: 'warning',
        title: 'Some ACLs were created, but there were errors',
        description: er.message,
      });
    });
  } else if (errors.length > 0 && !created) {
    errors.forEach((er) => {
      toast({
        status: 'error',
        description: er.message,
      });
    });
  } else {
    toast({
      status: 'success',
      description: 'ACLs created successfully',
    });
  }
};
