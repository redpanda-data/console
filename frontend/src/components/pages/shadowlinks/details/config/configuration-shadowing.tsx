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

import { ConfigurationSchemaRegistry } from './configuration-schema-registry';
import type { UnifiedACLFilter, UnifiedNameFilter, UnifiedShadowLink } from '../../model';
import {
  getFilterTypeLabel,
  getOperationLabel,
  getPatternTypeLabel,
  getPermissionTypeLabel,
  getResourceTypeLabel,
} from '../../shadowlink-helpers';

export type ConfigurationShadowingProps = {
  shadowLink: UnifiedShadowLink;
};

// Component to display a single name filter (topic or consumer group)
const NameFilterDisplay = ({ filter, index }: { filter: UnifiedNameFilter; index: number }) => {
  const filterLabel = getFilterTypeLabel(filter.patternType, filter.filterType);

  return (
    <Item>
      <div className="font-medium text-sm">{filterLabel}</div>
      <div className="flex flex-wrap gap-2">
        {filter.name ? (
          <Badge size="sm" testId={`filter-${index}-name`} variant="info-inverted">
            {filter.name}
          </Badge>
        ) : (
          <Badge size="sm" variant="neutral-inverted">
            (empty)
          </Badge>
        )}
      </div>
    </Item>
  );
};

// Reusable component for displaying name filter sections
const NameFilterSection = ({
  title,
  filters,
  testId,
  emptyMessage,
}: {
  title: string;
  filters: UnifiedNameFilter[];
  testId: string;
  emptyMessage: string;
}) => (
  <Card size="full" testId={`${testId}-card`}>
    <CardHeader>
      <h3 className="text-heading-md">{title}</h3>
    </CardHeader>
    <CardContent>
      {filters.length > 0 ? (
        <ItemGroup>
          {filters.map((filter, index) => (
            <NameFilterDisplay
              filter={filter}
              index={index}
              key={`${testId}-${filter.name}-${filter.patternType}-${filter.filterType}`}
            />
          ))}
        </ItemGroup>
      ) : (
        <div className="text-body text-muted-foreground" data-testid={`no-${testId}`}>
          {emptyMessage}
        </div>
      )}
    </CardContent>
  </Card>
);

// Component to display a single ACL filter
const ACLFilterDisplay = ({ filter, index }: { filter: UnifiedACLFilter; index: number }) => {
  const resourceFilter = filter.resourceFilter;
  const accessFilter = filter.accessFilter;

  return (
    <div className="space-y-3 rounded-lg border p-4" data-testid={`acl-filter-${index}`}>
      <div className="font-medium text-sm">ACL Filter {index + 1}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Resource type:</span>{' '}
          <Badge size="sm" variant="info-inverted">
            {getResourceTypeLabel(resourceFilter?.resourceType)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Pattern:</span>{' '}
          <Badge size="sm" variant="info-inverted">
            {getPatternTypeLabel(resourceFilter?.patternType)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Resource name:</span>{' '}
          <Badge size="sm" variant="info-inverted">
            {resourceFilter?.name || 'All'}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Principal:</span>{' '}
          <Badge size="sm" variant="info-inverted">
            {accessFilter?.principal || 'All'}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Operation:</span>{' '}
          <Badge size="sm" variant="info-inverted">
            {getOperationLabel(accessFilter?.operation)}
          </Badge>
        </div>
        <div>
          <span className="text-muted-foreground">Permission:</span>{' '}
          <Badge size="sm" variant="info-inverted">
            {getPermissionTypeLabel(accessFilter?.permissionType)}
          </Badge>
        </div>
        <div className="md:col-span-3">
          <span className="text-muted-foreground">Host:</span>{' '}
          <Badge size="sm" variant="info-inverted">
            {accessFilter?.host || 'All'}
          </Badge>
        </div>
      </div>
    </div>
  );
};

// Reusable component for displaying ACL filter section
const ACLFilterSection = ({ filters }: { filters: UnifiedACLFilter[] }) => {
  const hasAllACLs = filters.length === 0;

  return (
    <Card size="full" testId="acl-replication-card">
      <CardHeader>
        <h3 className="text-heading-md">ACL replication</h3>
      </CardHeader>
      <CardContent>
        {hasAllACLs ? (
          <Badge testId="all-acls-badge" variant="secondary-inverted">
            All ACLs
          </Badge>
        ) : (
          <div className="space-y-3">
            {filters.map((filter, index) => (
              <ACLFilterDisplay
                filter={filter}
                index={index}
                key={`acl-${filter.resourceFilter?.resourceType}-${filter.resourceFilter?.name}-${filter.accessFilter?.principal}`}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const ConfigurationShadowing = ({ shadowLink }: ConfigurationShadowingProps) => {
  const topicSyncOptions = shadowLink.configurations?.topicMetadataSyncOptions;
  const consumerSyncOptions = shadowLink.configurations?.consumerOffsetSyncOptions;
  const securitySyncOptions = shadowLink.configurations?.securitySyncOptions;
  const schemaRegistrySyncOptions = shadowLink.configurations?.schemaRegistrySyncOptions;

  // Get filters
  const topicFilters = topicSyncOptions?.autoCreateShadowTopicFilters || [];
  const consumerFilters = consumerSyncOptions?.groupFilters || [];
  const aclFilters = securitySyncOptions?.aclFilters || [];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-heading-lg" data-testid="shadowing-title">
        Shadowing
      </h2>

      {/* Topic Replication Section */}
      <NameFilterSection
        emptyMessage="No topic filters configured"
        filters={topicFilters}
        testId="topic-replication"
        title="Topic replication"
      />

      {/* ACL Replication Section */}
      <ACLFilterSection filters={aclFilters} />

      {/* Consumer Group Replication Section */}
      <NameFilterSection
        emptyMessage="No consumer group filters configured"
        filters={consumerFilters}
        testId="consumer-group-replication"
        title="Consumer group replication"
      />

      {/* Schema Registry Section */}
      <ConfigurationSchemaRegistry syncOptions={schemaRegistrySyncOptions} />
    </div>
  );
};
