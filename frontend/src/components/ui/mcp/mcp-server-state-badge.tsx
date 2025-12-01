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
import { AlertCircle, Check, Clock, Loader2, StopCircle } from 'lucide-react';
import { MCPServer_State } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useGetMCPServerQuery } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';

const getMCPServerStatus = (state: MCPServer_State): { icon: React.ReactNode; text: string; variant: BadgeVariant } => {
  switch (state) {
    case MCPServer_State.RUNNING:
      return {
        icon: <Check className="h-3 w-3" />,
        text: 'Running',
        variant: 'green',
      };
    case MCPServer_State.STARTING:
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        text: 'Starting',
        variant: 'blue',
      };
    case MCPServer_State.ERROR:
      return {
        icon: <AlertCircle className="h-3 w-3" />,
        text: 'Error',
        variant: 'red',
      };
    case MCPServer_State.STOPPED:
      return {
        icon: <StopCircle className="h-3 w-3" />,
        text: 'Stopped',
        variant: 'gray',
      };
    case MCPServer_State.STOPPING:
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        text: 'Stopping',
        variant: 'yellow',
      };
    default:
      return {
        icon: <Clock className="h-3 w-3" />,
        text: 'Unknown',
        variant: 'gray',
      };
  }
};

export const McpServerStateBadge = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  if (!mcpServerData?.mcpServer) {
    return null;
  }

  const config = getMCPServerStatus(mcpServerData?.mcpServer?.state);
  return (
    <Badge icon={config.icon} variant={config.variant}>
      {config.text}
    </Badge>
  );
};
