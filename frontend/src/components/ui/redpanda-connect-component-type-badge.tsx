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

import { Badge, type BadgeVariant } from 'components/redpanda-ui/components/badge';
import { Cpu, Database, FolderInput, FolderOutput, HelpCircle } from 'lucide-react';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';

interface RedpandaConnectComponentTypeBadgeProps {
  componentType: MCPServer_Tool_ComponentType;
}

const getComponentTypeConfig = (
  componentType: MCPServer_Tool_ComponentType,
): { icon: React.ReactNode; text: string; variant: BadgeVariant } => {
  switch (componentType) {
    case MCPServer_Tool_ComponentType.PROCESSOR:
      return {
        icon: <Cpu className="h-4 w-4" />,
        text: 'Processor',
        variant: 'blue',
      };
    case MCPServer_Tool_ComponentType.CACHE:
      return {
        icon: <Database className="h-4 w-4" />,
        text: 'Cache',
        variant: 'purple',
      };
    case MCPServer_Tool_ComponentType.INPUT:
      return {
        icon: <FolderInput className="h-4 w-4" />,
        text: 'Input',
        variant: 'green',
      };
    case MCPServer_Tool_ComponentType.OUTPUT:
      return {
        icon: <FolderOutput className="h-4 w-4" />,
        text: 'Output',
        variant: 'orange',
      };
    default:
      return {
        icon: <HelpCircle className="h-4 w-4" />,
        text: 'Unspecified',
        variant: 'gray',
      };
  }
};

export const RedpandaConnectComponentTypeBadge = ({ componentType }: RedpandaConnectComponentTypeBadgeProps) => {
  const config = getComponentTypeConfig(componentType);

  return (
    <Badge icon={config.icon} variant={config.variant}>
      {config.text}
    </Badge>
  );
};
