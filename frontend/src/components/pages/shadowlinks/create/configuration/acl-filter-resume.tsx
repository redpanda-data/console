/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Badge } from 'components/redpanda-ui/components/badge';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';
import { useFormContext, useWatch } from 'react-hook-form';

import type { FormValues } from '../model';

// Helper functions to convert enum values to readable labels
const getResourceTypeLabel = (type: ACLResource | undefined): string => {
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

const getPatternTypeLabel = (pattern: ACLPattern | undefined): string => {
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

const getOperationLabel = (operation: ACLOperation | undefined): string => {
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

const getPermissionTypeLabel = (permissionType: ACLPermissionType | undefined): string => {
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

// ACL Filter Resume Component - shows compact summary
export const ACLFilterResume = ({ index }: { index: number }) => {
  const { control } = useFormContext<FormValues>();

  const resourceType = useWatch({ control, name: `aclFilters.${index}.resourceType` });
  const resourcePattern = useWatch({ control, name: `aclFilters.${index}.resourcePattern` });
  const resourceName = useWatch({ control, name: `aclFilters.${index}.resourceName` });
  const principal = useWatch({ control, name: `aclFilters.${index}.principal` });
  const operation = useWatch({ control, name: `aclFilters.${index}.operation` });
  const permissionType = useWatch({ control, name: `aclFilters.${index}.permissionType` });
  const host = useWatch({ control, name: `aclFilters.${index}.host` });

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="font-medium text-sm">ACL Filter {index + 1}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Resource Type:</span>{' '}
          <Badge size="sm" variant="blue">
            {getResourceTypeLabel(resourceType)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Pattern:</span>{' '}
          <Badge size="sm" variant="blue">
            {getPatternTypeLabel(resourcePattern)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Resource Name:</span>{' '}
          <Badge size="sm" variant="blue">
            {resourceName || 'All'}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Principal:</span>{' '}
          <Badge size="sm" variant="blue">
            {principal || 'All'}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Operation:</span>{' '}
          <Badge size="sm" variant="blue">
            {getOperationLabel(operation)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Permission:</span>{' '}
          <Badge size="sm" variant="blue">
            {getPermissionTypeLabel(permissionType)}
          </Badge>
        </div>
        <div className="md:col-span-3">
          <span className="text-muted-foreground">Host:</span>{' '}
          <Badge size="sm" variant="blue">
            {host || 'All'}
          </Badge>
        </div>
      </div>
    </div>
  );
};
