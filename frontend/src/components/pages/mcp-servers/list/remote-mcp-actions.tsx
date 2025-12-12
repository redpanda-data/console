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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { Copy, Loader2, MoreHorizontal, Pause, Play } from 'lucide-react';
import { MCPServer_State } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import React from 'react';
import {
  useDeleteMCPServerMutation,
  useStartMCPServerMutation,
  useStopMCPServerMutation,
} from 'react-query/api/remote-mcp';
import { toast } from 'sonner';

import type { MCPServer } from './remote-mcp-list-page';

type RemoteMCPActionsCellProps = {
  server: MCPServer;
  setIsDeleteDialogOpen: (open: boolean) => void;
};

export const RemoteMCPActionsCell = ({ server, setIsDeleteDialogOpen }: RemoteMCPActionsCellProps) => {
  const { mutate: deleteMCPServer, isPending: isDeleting } = useDeleteMCPServerMutation();
  const { mutate: startMCPServer, isPending: isStarting } = useStartMCPServerMutation();
  const { mutate: stopMCPServer, isPending: isStopping } = useStopMCPServerMutation();

  const handleDelete = (id: string) => {
    deleteMCPServer(
      { id },
      {
        onSuccess: () => {
          toast.success(`MCP server ${server.name} deleted`);
        },
      }
    );
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(server.url);
  };

  const handleStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    startMCPServer({ id: server.id });
  };

  const handleStop = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    stopMCPServer({ id: server.id });
  };

  const canStart = server.state === MCPServer_State.STOPPED || server.state === MCPServer_State.ERROR;
  const canStop = server.state === MCPServer_State.RUNNING;

  return (
    <div data-actions-column>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 data-[state=open]:bg-muted" size="icon" variant="ghost">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={handleCopy}>
            <div className="flex items-center gap-4">
              <Copy className="h-4 w-4" /> Copy URL
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canStart && (
            <DropdownMenuItem onClick={handleStart}>
              {isStarting ? (
                <div className="flex items-center gap-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Starting
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Play className="h-4 w-4" />
                  Start Server
                </div>
              )}
            </DropdownMenuItem>
          )}
          {canStop && (
            <DropdownMenuItem onClick={handleStop}>
              {isStopping ? (
                <div className="flex items-center gap-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Stopping
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Pause className="h-4 w-4" /> Stop Server
                </div>
              )}
            </DropdownMenuItem>
          )}
          {(canStart || canStop) && <DropdownMenuSeparator />}
          <DeleteResourceAlertDialog
            isDeleting={isDeleting}
            onDelete={handleDelete}
            onOpenChange={setIsDeleteDialogOpen}
            resourceId={server.id}
            resourceName={server.name}
            resourceType="Remote MCP Server"
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
