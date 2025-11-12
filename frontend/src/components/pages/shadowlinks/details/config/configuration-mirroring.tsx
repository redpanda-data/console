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

'use client';

import { Badge } from 'components/redpanda-ui/components/badge';
import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { Item, ItemGroup } from 'components/redpanda-ui/components/item';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import type { ACLFilter, NameFilter } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';

export interface ConfigurationMirroringProps {
  shadowLink: ShadowLink;
}

// Helper function to get filter label from pattern and filter type
const getFilterTypeLabel = (patternType: PatternType, filterType: FilterType): string => {
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

// Component to display a single name filter (topic or consumer group)
const NameFilterDisplay = ({ filter, index }: { filter: NameFilter; index: number }) => {
  const filterLabel = getFilterTypeLabel(filter.patternType, filter.filterType);

  return (
    <Item>
      <div className="font-medium text-sm">{filterLabel}</div>
      <div className="flex flex-wrap gap-2">
        {filter.name ? (
          <Badge size="sm" testId={`filter-${index}-name`} variant="blue">
            {filter.name}
          </Badge>
        ) : (
          <Badge size="sm" variant="gray">
            (empty)
          </Badge>
        )}
      </div>
    </Item>
  );
};

// Component to display a single ACL filter
const ACLFilterDisplay = ({ filter, index }: { filter: ACLFilter; index: number }) => {
  const resourceFilter = filter.resourceFilter;
  const accessFilter = filter.accessFilter;

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid={`acl-filter-${index}`}>
      <div className="font-medium text-sm">ACL Filter {index + 1}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Resource Type:</span>{' '}
          <Badge size="sm" variant="blue">
            {getResourceTypeLabel(resourceFilter?.resourceType)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Pattern:</span>{' '}
          <Badge size="sm" variant="blue">
            {getPatternTypeLabel(resourceFilter?.patternType)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Resource Name:</span>{' '}
          <Badge size="sm" variant="blue">
            {resourceFilter?.name || 'All'}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Principal:</span>{' '}
          <Badge size="sm" variant="blue">
            {accessFilter?.principal || 'All'}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Operation:</span>{' '}
          <Badge size="sm" variant="blue">
            {getOperationLabel(accessFilter?.operation)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Permission:</span>{' '}
          <Badge size="sm" variant="blue">
            {getPermissionTypeLabel(accessFilter?.permissionType)}
          </Badge>
        </div>
        <div className="md:col-span-3">
          <span className="text-muted-foreground">Host:</span>{' '}
          <Badge size="sm" variant="blue">
            {accessFilter?.host || 'All'}
          </Badge>
        </div>
      </div>
    </div>
  );
};

export const ConfigurationMirroring = ({ shadowLink }: ConfigurationMirroringProps) => {
  const topicSyncOptions = shadowLink.configurations?.topicMetadataSyncOptions;
  const consumerSyncOptions = shadowLink.configurations?.consumerOffsetSyncOptions;
  const securitySyncOptions = shadowLink.configurations?.securitySyncOptions;

  // Get filters
  const topicFilters = topicSyncOptions?.autoCreateShadowTopicFilters || [];
  const consumerFilters = consumerSyncOptions?.groupFilters || [];
  const aclFilters = securitySyncOptions?.aclFilters || [];

  const hasAllACLs = aclFilters.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Heading level={2} testId="shadowing-title">
        Shadowing
      </Heading>

      {/* Topic Replication Section */}
      <Card size="full" testId="topic-replication-card">
        <CardHeader>
          <Heading level={3}>Topic replication</Heading>
        </CardHeader>
        <CardContent>
          {topicFilters.length > 0 ? (
            <ItemGroup>
              {topicFilters.map((filter, index) => (
                <NameFilterDisplay filter={filter} index={index} key={`topic-filter-${index}`} />
              ))}
            </ItemGroup>
          ) : (
            <Text className="text-muted-foreground" testId="no-topic-filters">
              No topic filters configured
            </Text>
          )}
        </CardContent>
      </Card>

      {/* ACL Replication Section */}
      <Card size="full" testId="acl-replication-card">
        <CardHeader>
          <Heading level={3}>ACL replication</Heading>
        </CardHeader>
        <CardContent>
          {hasAllACLs ? (
            <Badge testId="all-acls-badge" variant="secondary">
              All ACLs
            </Badge>
          ) : (
            <div className="space-y-3">
              {aclFilters.map((filter, index) => (
                <ACLFilterDisplay filter={filter} index={index} key={`acl-filter-${index}`} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consumer Group Replication Section */}
      <Card size="full" testId="consumer-group-replication-card">
        <CardHeader>
          <Heading level={3}>Consumer group replication</Heading>
        </CardHeader>
        <CardContent>
          {consumerFilters.length > 0 ? (
            <ItemGroup>
              {consumerFilters.map((filter, index) => (
                <NameFilterDisplay filter={filter} index={index} key={`consumer-filter-${index}`} />
              ))}
            </ItemGroup>
          ) : (
            <Text className="text-muted-foreground" testId="no-consumer-filters">
              No consumer group filters configured
            </Text>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
