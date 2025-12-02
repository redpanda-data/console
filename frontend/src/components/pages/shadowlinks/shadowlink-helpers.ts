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

import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';

// Helper function to get filter label from pattern and filter type
export const getFilterTypeLabel = (patternType: PatternType, filterType: FilterType): string => {
  if (patternType === PatternType.LITERAL && filterType === FilterType.INCLUDE) {
    return 'Include specific topics';
  }
  if (patternType === PatternType.PREFIX && filterType === FilterType.INCLUDE) {
    return 'Include starting with';
  }
  if (patternType === PatternType.LITERAL && filterType === FilterType.EXCLUDE) {
    return 'Exclude specific';
  }
  if (patternType === PatternType.PREFIX && filterType === FilterType.EXCLUDE) {
    return 'Exclude starting with';
  }
  return 'Include specific topics';
};

// Helper functions to convert ACL enum values to readable labels
export const getResourceTypeLabel = (type: ACLResource | undefined): string => {
  if (type === undefined) {
    return 'Any';
  }
  switch (type) {
    case ACLResource.ACL_RESOURCE_ANY:
      return 'Any';
    case ACLResource.ACL_RESOURCE_TOPIC:
      return 'Topic';
    case ACLResource.ACL_RESOURCE_GROUP:
      return 'Consumer Group';
    case ACLResource.ACL_RESOURCE_CLUSTER:
      return 'Cluster';
    case ACLResource.ACL_RESOURCE_TXN_ID:
      return 'Transaction ID';
    case ACLResource.ACL_RESOURCE_SR_SUBJECT:
      return 'Schema Registry Subject';
    case ACLResource.ACL_RESOURCE_SR_REGISTRY:
      return 'Schema Registry';
    default:
      return 'Any';
  }
};

export const getPatternTypeLabel = (pattern: ACLPattern | undefined): string => {
  if (pattern === undefined) {
    return 'Any';
  }
  switch (pattern) {
    case ACLPattern.ACL_PATTERN_ANY:
      return 'Any';
    case ACLPattern.ACL_PATTERN_LITERAL:
      return 'Literal';
    case ACLPattern.ACL_PATTERN_PREFIXED:
      return 'Prefixed';
    case ACLPattern.ACL_PATTERN_MATCH:
      return 'Match';
    default:
      return 'Any';
  }
};

export const getOperationLabel = (operation: ACLOperation | undefined): string => {
  if (operation === undefined) {
    return 'Any';
  }
  switch (operation) {
    case ACLOperation.ACL_OPERATION_ANY:
      return 'Any';
    case ACLOperation.ACL_OPERATION_READ:
      return 'Read';
    case ACLOperation.ACL_OPERATION_WRITE:
      return 'Write';
    case ACLOperation.ACL_OPERATION_CREATE:
      return 'Create';
    case ACLOperation.ACL_OPERATION_REMOVE:
      return 'Remove';
    case ACLOperation.ACL_OPERATION_ALTER:
      return 'Alter';
    case ACLOperation.ACL_OPERATION_DESCRIBE:
      return 'Describe';
    case ACLOperation.ACL_OPERATION_CLUSTER_ACTION:
      return 'Cluster Action';
    case ACLOperation.ACL_OPERATION_DESCRIBE_CONFIGS:
      return 'Describe Configs';
    case ACLOperation.ACL_OPERATION_ALTER_CONFIGS:
      return 'Alter Configs';
    case ACLOperation.ACL_OPERATION_IDEMPOTENT_WRITE:
      return 'Idempotent Write';
    default:
      return 'Any';
  }
};

export const getPermissionTypeLabel = (permissionType: ACLPermissionType | undefined): string => {
  if (permissionType === undefined) {
    return 'Any';
  }
  switch (permissionType) {
    case ACLPermissionType.ACL_PERMISSION_TYPE_ANY:
      return 'Any';
    case ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW:
      return 'Allow';
    case ACLPermissionType.ACL_PERMISSION_TYPE_DENY:
      return 'Deny';
    default:
      return 'Any';
  }
};
