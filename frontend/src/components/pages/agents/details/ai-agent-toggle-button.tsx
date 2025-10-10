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
import { AIAgent_State } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { useGetAIAgentQuery, useStartAIAgentMutation, useStopAIAgentMutation } from 'react-query/api/ai-agent';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

export const AIAgentToggleButton = () => {
  const { id } = useParams<{ id: string }>();
  const { data: aiAgentData } = useGetAIAgentQuery({ id: id || '' }, { enabled: !!id });

  const { mutateAsync: startAIAgent, isPending: isStarting } = useStartAIAgentMutation();
  const { mutateAsync: stopAIAgent, isPending: isStopping } = useStopAIAgentMutation();

  const handleStartAgent = async () => {
    if (!id) {
      return;
    }
    await startAIAgent(
      { id },
      {
        onError: (error) => {
          toast.error(formatToastErrorMessageGRPC({ error, action: 'start', entity: 'AI agent' }));
        },
      }
    );
  };

  const handleStopAgent = async () => {
    if (!id) {
      return;
    }
    await stopAIAgent(
      { id },
      {
        onError: (error) => {
          toast.error(formatToastErrorMessageGRPC({ error, action: 'stop', entity: 'AI agent' }));
        },
      }
    );
  };

  if (!aiAgentData?.aiAgent) {
    return null;
  }

  if (aiAgentData.aiAgent.state === AIAgent_State.RUNNING || aiAgentData.aiAgent.state === AIAgent_State.STOPPING) {
    return (
      <Button
        className="gap-2"
        disabled={isStopping || aiAgentData.aiAgent.state === AIAgent_State.STOPPING}
        onClick={handleStopAgent}
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
      disabled={isStarting || aiAgentData.aiAgent.state === AIAgent_State.STARTING}
      onClick={handleStartAgent}
      size="sm"
      variant="outline"
    >
      {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      {isStarting ? 'Starting...' : 'Start'}
    </Button>
  );
};
