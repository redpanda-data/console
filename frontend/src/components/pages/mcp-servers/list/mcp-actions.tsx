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

import { CLOUD_MANAGED_TAG_KEYS } from 'components/constants';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import { Label } from 'components/redpanda-ui/components/label';
import { Switch } from 'components/redpanda-ui/components/switch';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { DeleteResourceAlertDialog } from 'components/ui/delete-resource-alert-dialog';
import { Copy, Loader2, MoreHorizontal, Pause, Play } from 'lucide-react';
import React from 'react';
import { MCPServer_State, useStartMCPServerMutation, useStopMCPServerMutation } from 'react-query/api/remote-mcp';
import { toast } from 'sonner';

import type { MCPServer } from './remote-mcp-list-page';

type MCPActionsProps = {
  server: MCPServer;
  onDeleteWithServiceAccount: (
    serverId: string,
    deleteServiceAccount: boolean,
    secretName: string | null,
    serviceAccountId: string | null
  ) => Promise<void>;
  isDeletingServer: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
};

export const MCPActions = ({
  server,
  onDeleteWithServiceAccount,
  isDeletingServer,
  setIsDeleteDialogOpen,
}: MCPActionsProps) => {
  const { mutate: startMCPServer, isPending: isStarting } = useStartMCPServerMutation();
  const { mutate: stopMCPServer, isPending: isStopping } = useStopMCPServerMutation();
  const [deleteServiceAccountFlag, setDeleteServiceAccountFlag] = React.useState(false);

  // Get service account and secret info from server tags
  const serviceAccountId = server.tags?.[CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID] || null;
  const secretName = server.tags?.[CLOUD_MANAGED_TAG_KEYS.SECRET_ID] || null;

  const handleDelete = async (id: string) => {
    await onDeleteWithServiceAccount(id, deleteServiceAccountFlag, secretName, serviceAccountId);
    setDeleteServiceAccountFlag(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(server.url);
    toast.success('URL copied to clipboard');
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
          <DropdownMenuItem data-testid="copy-url-menu-item" onClick={handleCopy}>
            <div className="flex items-center gap-4">
              <Copy className="h-4 w-4" /> Copy URL
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {canStart && (
            <DropdownMenuItem data-testid="start-server-menu-item" onClick={handleStart}>
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
            <DropdownMenuItem data-testid="stop-server-menu-item" onClick={handleStop}>
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
            isDeleting={isDeletingServer}
            onDelete={handleDelete}
            onOpenChange={(open) => {
              setIsDeleteDialogOpen(open);
              if (!open) {
                setDeleteServiceAccountFlag(false);
              }
            }}
            resourceId={server.id}
            resourceName={server.name}
            resourceType="Remote MCP Server"
          >
            {serviceAccountId && secretName && (
              <div className="flex items-center space-x-2 rounded-lg border border-muted bg-muted/10 p-4">
                <Switch
                  checked={deleteServiceAccountFlag}
                  id="delete-service-account"
                  onCheckedChange={setDeleteServiceAccountFlag}
                />
                <Label className="cursor-pointer font-normal" htmlFor="delete-service-account">
                  Also delete associated service account and secret <InlineCode>{secretName}</InlineCode>
                </Label>
              </div>
            )}
          </DeleteResourceAlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
