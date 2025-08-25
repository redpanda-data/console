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
import { AlertCircle, Check, Clock, Loader2, StopCircle } from 'lucide-react';
import { MCPServer_State } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useGetMCPServerQuery } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';

const getMCPServerStatus = (state: MCPServer_State) => {
  switch (state) {
    case MCPServer_State.RUNNING:
      return {
        icon: <Check className="h-3 w-3" />,
        text: 'Running',
        className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      };
    case MCPServer_State.STARTING:
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        text: 'Starting',
        className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      };
    case MCPServer_State.ERROR:
      return {
        icon: <AlertCircle className="h-3 w-3" />,
        text: 'Error',
        className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      };
    case MCPServer_State.STOPPED:
      return {
        icon: <StopCircle className="h-3 w-3" />,
        text: 'Stopped',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      };
    case MCPServer_State.STOPPING:
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        text: 'Stopping',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      };
    default:
      return {
        icon: <Clock className="h-3 w-3" />,
        text: 'Unknown',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
      };
  }
};

export const RemoteMCPStatusBadge = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  if (!mcpServerData?.mcpServer) return null;

  const config = getMCPServerStatus(mcpServerData?.mcpServer?.state);
  return (
    <Badge className={`gap-1 ${config.className}`}>
      {config.icon}
      {config.text}
    </Badge>
  );
};
