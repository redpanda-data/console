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
import { Button } from 'components/redpanda-ui/components/button';
import { Loader2, Play, Square } from 'lucide-react';
import { MCPServer_State } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import { useGetMCPServerQuery, useStartMCPServerMutation, useStopMCPServerMutation } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';

export const RemoteMCPToggleButton = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  const { mutateAsync: startMCPServer, isPending: isStarting } = useStartMCPServerMutation();
  const { mutateAsync: stopMCPServer, isPending: isStopping } = useStopMCPServerMutation();

  const handleStartServer = async () => {
    if (!id) return;
    try {
      await startMCPServer({ id });
    } catch (error) {
      console.error('Failed to start MCP server:', error);
    }
  };

  const handleStopServer = async () => {
    if (!id) return;
    try {
      await stopMCPServer({ id });
    } catch (error) {
      console.error('Failed to stop MCP server:', error);
    }
  };

  if (!mcpServerData?.mcpServer) return null;

  if (
    mcpServerData.mcpServer.state === MCPServer_State.RUNNING ||
    mcpServerData.mcpServer.state === MCPServer_State.STOPPING
  ) {
    return (
      <Button
        className="gap-2"
        disabled={isStopping || mcpServerData.mcpServer.state === MCPServer_State.STOPPING}
        onClick={handleStopServer}
        size="sm"
        variant="outline"
      >
        {isStopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
        {isStopping ? 'Stopping...' : 'Stop'}
      </Button>
    );
  }

  return (
    <Button
      className="gap-2"
      disabled={isStarting || mcpServerData.mcpServer.state === MCPServer_State.STARTING}
      onClick={handleStartServer}
      size="sm"
      variant="outline"
    >
      {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      {isStarting ? 'Starting...' : 'Start'}
    </Button>
  );
};
