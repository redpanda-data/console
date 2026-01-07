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

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { MCPIcon } from 'components/redpanda-ui/components/icons';
import { List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Bot, Database, Workflow } from 'lucide-react';
import {
  type ListResourcesResponse_Resource,
  ListResourcesResponse_Type,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import type { ReactNode } from 'react';

type ResourceInUseAlertProps = {
  resources: ListResourcesResponse_Resource[];
};

type ResourceTypeInfo = {
  label: string;
  icon: ReactNode;
};

const getResourceTypeInfo = (type: ListResourcesResponse_Type): ResourceTypeInfo => {
  switch (type) {
    case ListResourcesResponse_Type.PIPELINE:
      return {
        label: 'Redpanda Connect Pipelines',
        icon: <Workflow className="h-4 w-4" />,
      };
    case ListResourcesResponse_Type.CLUSTER:
      return {
        label: 'Clusters',
        icon: <Database className="h-4 w-4" />,
      };
    case ListResourcesResponse_Type.MCP_SERVER:
      return {
        label: 'MCP Servers',
        icon: <MCPIcon className="h-4 w-4" />,
      };
    case ListResourcesResponse_Type.AI_AGENT:
      return {
        label: 'AI Agents',
        icon: <Bot className="h-4 w-4" />,
      };
    default:
      return {
        label: 'Other Resources',
        icon: <AlertCircle className="h-4 w-4" />,
      };
  }
};

const groupResourcesByType = (
  resources: ListResourcesResponse_Resource[]
): Map<ListResourcesResponse_Type, ListResourcesResponse_Resource[]> => {
  const grouped = new Map<ListResourcesResponse_Type, ListResourcesResponse_Resource[]>();

  for (const resource of resources) {
    const existing = grouped.get(resource.type) || [];
    grouped.set(resource.type, [...existing, resource]);
  }

  return grouped;
};

export const ResourceInUseAlert = ({ resources }: ResourceInUseAlertProps) => {
  if (resources.length === 0) {
    return null;
  }

  const groupedResources = groupResourcesByType(resources);

  return (
    <Alert className="mt-4" testId="resource-in-use-alert" variant="destructive">
      <AlertCircle />
      <AlertTitle>Resource is in use</AlertTitle>
      <AlertDescription>
        <Text>The secret that you are about to delete is still in use by the following:</Text>
        {Array.from(groupedResources.entries()).map(([type, resourceList]) => {
          const { label, icon } = getResourceTypeInfo(type);
          return (
            <div key={type}>
              <div className="flex items-center gap-2">
                {icon}
                <Text className="font-medium">{label}</Text>
              </div>
              <List>
                {resourceList.map((resource) => (
                  <ListItem key={resource.id}>
                    <Text>{resource.displayName || resource.id}</Text>
                  </ListItem>
                ))}
              </List>
            </div>
          );
        })}
      </AlertDescription>
    </Alert>
  );
};
