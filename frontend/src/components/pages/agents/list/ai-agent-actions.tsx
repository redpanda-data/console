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
import { AIAgent_State } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import React from 'react';
import { useStartAIAgentMutation, useStopAIAgentMutation } from 'react-query/api/ai-agent';
import { toast } from 'sonner';

import type { AIAgent } from './ai-agent-list-page';

type AIAgentActionsProps = {
  agent: AIAgent;
  onDeleteWithServiceAccount: (
    agentId: string,
    deleteServiceAccount: boolean,
    secretName: string | null,
    serviceAccountId: string | null
  ) => Promise<void>;
  isDeletingAgent: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
};

export const AIAgentActions = ({
  agent,
  onDeleteWithServiceAccount,
  isDeletingAgent,
  setIsDeleteDialogOpen,
}: AIAgentActionsProps) => {
  const { mutate: startAIAgent, isPending: isStarting } = useStartAIAgentMutation();
  const { mutate: stopAIAgent, isPending: isStopping } = useStopAIAgentMutation();
  const [deleteServiceAccountFlag, setDeleteServiceAccountFlag] = React.useState(false);

  // Get service account and secret info from agent tags
  const serviceAccountId = agent.tags?.service_account_id || null;
  const secretName = agent.tags?.secret_id || null;

  const handleDelete = async (id: string) => {
    await onDeleteWithServiceAccount(id, deleteServiceAccountFlag, secretName, serviceAccountId);
    setDeleteServiceAccountFlag(false);
  };

  const handleCopy = () => {
    if (agent.url) {
      navigator.clipboard.writeText(agent.url);
      toast.success('URL copied to clipboard');
    }
  };

  const handleStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    startAIAgent({ id: agent.id });
  };

  const handleStop = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    stopAIAgent({ id: agent.id });
  };

  const canStart = agent.state === AIAgent_State.STOPPED || agent.state === AIAgent_State.ERROR;
  const canStop = agent.state === AIAgent_State.RUNNING;

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
          {agent.url && (
            <>
              <DropdownMenuItem onClick={handleCopy}>
                <div className="flex items-center gap-4">
                  <Copy className="h-4 w-4" /> Copy URL
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {canStart && (
            <DropdownMenuItem onClick={handleStart}>
              {isStarting ? (
                <div className="flex items-center gap-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Starting
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Play className="h-4 w-4" />
                  Start Agent
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
                  <Pause className="h-4 w-4" /> Stop Agent
                </div>
              )}
            </DropdownMenuItem>
          )}
          {(canStart || canStop) && <DropdownMenuSeparator />}
          <DeleteResourceAlertDialog
            isDeleting={isDeletingAgent}
            onDelete={handleDelete}
            onOpenChange={(open) => {
              setIsDeleteDialogOpen(open);
              if (!open) {
                setDeleteServiceAccountFlag(false);
              }
            }}
            resourceId={agent.id}
            resourceName={agent.name}
            resourceType="AI Agent"
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
