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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Cpu, Database, FolderInput, FolderOutput, HelpCircle } from 'lucide-react';
import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';

interface RemoteMCPToolTypeBadgeProps {
  componentType: MCPServer_Tool_ComponentType;
}

const getComponentTypeConfig = (componentType: MCPServer_Tool_ComponentType) => {
  switch (componentType) {
    case MCPServer_Tool_ComponentType.PROCESSOR:
      return {
        icon: <Cpu className="h-3 w-3" />,
        text: 'Processor',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      };
    case MCPServer_Tool_ComponentType.CACHE:
      return {
        icon: <Database className="h-3 w-3" />,
        text: 'Cache',
        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      };
    case MCPServer_Tool_ComponentType.INPUT:
      return {
        icon: <FolderInput className="h-3 w-3" />,
        text: 'Input',
        className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      };
    case MCPServer_Tool_ComponentType.OUTPUT:
      return {
        icon: <FolderOutput className="h-3 w-3" />,
        text: 'Output',
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      };
    default:
      return {
        icon: <HelpCircle className="h-3 w-3" />,
        text: 'Unspecified',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      };
  }
};

export const RemoteMCPToolTypeBadge = ({ componentType }: RemoteMCPToolTypeBadgeProps) => {
  const config = getComponentTypeConfig(componentType);

  return (
    <Badge className={`flex items-center gap-1 ${config.className}`}>
      {config.icon}
      <span className="leading-none">{config.text}</span>
    </Badge>
  );
};
